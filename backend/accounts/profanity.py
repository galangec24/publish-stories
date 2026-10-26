"""Blocks foul words in what readers write (comments, chat, names).

The same lists live in web/src/lib/profanity.js so readers are warned while typing.
Spelling tricks are undone first: letters swapped for digits or symbols (sh1t, f*ck),
stretched letters (fuuuck) and spaced-out letters (p u t a).
"""
import re

from rest_framework import serializers

# Matched at the start of a word, so endings are caught too (fucking, putanginamo).
PREFIXES = [
    "fuck", "fck", "fuk", "motherfuck", "shit", "bullshit", "bitch", "cunt", "asshole", "bastard",
    "nigger", "nigga", "faggot", "retard", "whore", "slut", "dickhead",
    "putangina", "putanginamo", "tangina", "tanginamo", "pakyu", "pakshet", "punyeta", "puñeta",
    "tarantado", "kantot", "kantutan", "hindot", "jakol", "kupal", "hayop ka",
]
# Whole words only (short words that appear inside innocent ones).
WORDS = [
    "puta", "gago", "gaga", "ulol", "olol", "tanga", "bobo", "inutil", "dick", "cock", "pussy", "fag",
    "titi", "puke", "pekpek", "burat", "bilat", "oten", "yawa", "piste", "pisti", "buang", "wtf", "stfu",
]

_LEET = str.maketrans({"0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "$": "s", "5": "s", "7": "t", "*": "u"})


def _stretch(word):
    """f+u+c+k+ : each letter may be repeated."""
    return "".join(f"{re.escape(ch)}+" if ch != " " else r"\s*" for ch in word)


_PATTERN = re.compile(
    r"\b(?:" + "|".join(_stretch(w) for w in sorted(PREFIXES, key=len, reverse=True)) + r")"
    + r"|\b(?:" + "|".join(_stretch(w) for w in WORDS) + r")s?\b",
    re.IGNORECASE,
)


def _normalized(text):
    text = text.lower().translate(_LEET)
    # "p u t a" / "f.u.c.k" → "puta" / "fuck"
    return re.sub(r"\b(?:[a-z][\s._\-]+){2,}[a-z]\b", lambda m: re.sub(r"[\s._\-]+", "", m.group(0)), text)


# Real words that contain a blocked one.
ALLOWED = {"shitake", "shiitake", "scunthorpe", "cockatoo", "cockatiel", "dickens"}


def find_bad_word(text):
    """The offending word as written in the normalized text, or None."""
    if not text:
        return None
    normalized = _normalized(str(text))
    for match in _PATTERN.finditer(normalized):
        start, end = match.span()
        while start > 0 and normalized[start - 1].isalpha():
            start -= 1
        while end < len(normalized) and normalized[end].isalpha():
            end += 1
        if normalized[start:end] not in ALLOWED:
            return match.group(0)
    return None


MESSAGE = "Please keep it kind: that word isn't allowed here."


def clean(value):
    """Serializer-style check: returns the value, or raises a ValidationError."""
    if find_bad_word(value):
        raise serializers.ValidationError(MESSAGE)
    return value
