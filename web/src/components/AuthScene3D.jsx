import { Float, MeshDistortMaterial, Sparkles } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

/** Glowing ring the book floats through: the "portal" into a story. */
function Portal({ mode }) {
  const ring = useRef()
  const inner = useRef()
  useFrame(({ clock }, delta) => {
    ring.current.rotation.z += delta * (mode === 'register' ? -0.35 : 0.35)
    ring.current.rotation.x = Math.sin(clock.elapsedTime * 0.4) * 0.25
    inner.current.rotation.z -= delta * 0.6
  })
  return (
    <group position={[0, 0, -1.2]}>
      <mesh ref={ring}>
        <torusGeometry args={[2.1, 0.06, 24, 160]} />
        <meshStandardMaterial color="#f5b942" emissive="#f5b942" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <mesh ref={inner}>
        <torusGeometry args={[1.75, 0.015, 12, 120]} />
        <meshBasicMaterial color="#8b6cff" transparent opacity={0.8} />
      </mesh>
      <mesh>
        <circleGeometry args={[2.05, 64]} />
        <MeshDistortMaterial color="#3a2a8a" transparent opacity={0.55} distort={0.35} speed={1.6} />
      </mesh>
    </group>
  )
}

function FloatingBook({ mode }) {
  const group = useRef()
  const left = useRef()
  const right = useRef()
  useFrame(({ clock, pointer }) => {
    const t = clock.elapsedTime
    // Pages "breathe" open and closed; register opens them wider.
    const open = (mode === 'register' ? 0.55 : 0.35) + Math.sin(t * 1.2) * 0.08
    left.current.rotation.y = open
    right.current.rotation.y = -open
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, pointer.x * 0.5, 0.05)
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -0.25 - pointer.y * 0.25, 0.05)
  })
  const page = (
    <>
      <mesh position={[0.62, 0, 0]}>
        <boxGeometry args={[1.25, 1.7, 0.05]} />
        <meshStandardMaterial color="#fbf3df" roughness={0.9} />
      </mesh>
      <mesh position={[0.62, 0, -0.035]}>
        <boxGeometry args={[1.3, 1.78, 0.03]} />
        <meshStandardMaterial color="#6a4ff0" roughness={0.45} metalness={0.2} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} position={[0.62, 0.55 - i * 0.17, 0.03]}>
          <planeGeometry args={[i % 3 === 2 ? 0.6 : 0.9, 0.03]} />
          <meshBasicMaterial color="#c4ad84" />
        </mesh>
      ))}
    </>
  )
  return (
    <Float speed={2} rotationIntensity={0.25} floatIntensity={0.6}>
      <group ref={group}>
        <group ref={left} rotation={[0, 0.35, 0]} scale={[-1, 1, 1]}>
          {page}
        </group>
        <group ref={right} rotation={[0, -0.35, 0]}>
          {page}
        </group>
      </group>
    </Float>
  )
}

export default function AuthScene3D({ mode = 'login' }) {
  return (
    <Canvas camera={{ position: [0, 0, 5.5], fov: 45 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 4]} intensity={1.5} color="#fff1d6" />
      <pointLight position={[0, 0, 1.5]} intensity={6} color="#f5b942" distance={5} />
      <Portal mode={mode} />
      <FloatingBook mode={mode} />
      <Sparkles count={80} scale={[6, 4, 3]} size={3} speed={0.6} color="#f5d58a" />
      <Sparkles count={40} scale={[5, 3, 2]} size={2} speed={0.3} color="#b8a6ff" />
    </Canvas>
  )
}
