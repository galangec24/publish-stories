from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .realtime import ADMINS_GROUP, user_group


class EventsConsumer(AsyncJsonWebsocketConsumer):
    """One socket per open tab. Server → client only (plus ping/pong keep-alive)."""

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.groups_joined = [user_group(user.pk)]
        if user.is_admin:
            self.groups_joined.append(ADMINS_GROUP)
        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "hello", "data": {"user_id": user.pk, "admin": user.is_admin}})

    async def disconnect(self, code):
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"event": "pong", "data": {}})

    async def push(self, message):
        await self.send_json({"event": message["event"], "data": message["data"]})
