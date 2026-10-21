import { ContactShadows, Float, Sparkles } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const PAGE_W = 1.5
const PAGE_H = 2.1

/** One page that keeps turning from the right half of the book to the left. */
function TurningPage({ delay, color }) {
  const pivot = useRef()
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.35 + delay) % 1
    // Ease in and out across the flip, with a pause at both ends.
    const p = THREE.MathUtils.smoothstep(t, 0.15, 0.85)
    pivot.current.rotation.y = -p * Math.PI * 0.94
    pivot.current.position.z = 0.03 + Math.sin(p * Math.PI) * 0.06
  })
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 12, 1)
    g.translate(PAGE_W / 2, 0, 0)
    // Slight curl so the turning page looks like paper rather than a card.
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      pos.setZ(i, Math.sin((x / PAGE_W) * Math.PI) * 0.12)
    }
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <group ref={pivot}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
    </group>
  )
}

function TextLines({ x }) {
  return (
    <group position={[x, 0.15, 0.031]}>
      {Array.from({ length: 11 }).map((_, i) => (
        <mesh key={i} position={[0, 0.75 - i * 0.15, 0]}>
          <planeGeometry args={[i % 4 === 3 ? 0.7 : 1.1, 0.035]} />
          <meshBasicMaterial color="#b9a27a" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  )
}

function OpenBook({ accent }) {
  const group = useRef()
  useFrame(({ clock, pointer }) => {
    // Follow the cursor a little, for parallax.
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -0.45 + pointer.y * 0.12, 0.05)
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, pointer.x * 0.25, 0.05)
    group.current.position.y = Math.sin(clock.elapsedTime * 0.8) * 0.05
  })
  return (
    <group ref={group} rotation={[-0.45, 0, 0]}>
      {/* covers */}
      <mesh position={[-PAGE_W / 2 - 0.02, 0, -0.06]} rotation={[0, 0.08, 0]}>
        <boxGeometry args={[PAGE_W + 0.12, PAGE_H + 0.12, 0.05]} />
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[PAGE_W / 2 + 0.02, 0, -0.06]} rotation={[0, -0.08, 0]}>
        <boxGeometry args={[PAGE_W + 0.12, PAGE_H + 0.12, 0.05]} />
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0.15} />
      </mesh>
      {/* page blocks */}
      <mesh position={[-PAGE_W / 2, 0, 0]} rotation={[0, 0.08, 0]}>
        <boxGeometry args={[PAGE_W, PAGE_H, 0.06]} />
        <meshStandardMaterial color="#f4e8cf" roughness={0.95} />
      </mesh>
      <mesh position={[PAGE_W / 2, 0, 0]} rotation={[0, -0.08, 0]}>
        <boxGeometry args={[PAGE_W, PAGE_H, 0.06]} />
        <meshStandardMaterial color="#f4e8cf" roughness={0.95} />
      </mesh>
      <group rotation={[0, 0.08, 0]}>
        <TextLines x={-PAGE_W / 2} />
      </group>
      <group rotation={[0, -0.08, 0]}>
        <TextLines x={PAGE_W / 2} />
      </group>
      {[0, 0.33, 0.66].map((d) => (
        <TurningPage key={d} delay={d} color="#fbf3df" />
      ))}
    </group>
  )
}

function FloatingBook({ position, color, rotation, speed }) {
  return (
    <Float speed={speed} rotationIntensity={1.2} floatIntensity={1.5}>
      <group position={position} rotation={rotation}>
        <mesh>
          <boxGeometry args={[0.55, 0.8, 0.14]} />
          <meshStandardMaterial color={color} roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[0.02, 0, 0]}>
          <boxGeometry args={[0.52, 0.76, 0.15]} />
          <meshStandardMaterial color="#f1e3c4" roughness={0.95} />
        </mesh>
      </group>
    </Float>
  )
}

export default function Hero3D({ accent = '#5b3fd1' }) {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 5.2], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} color="#fff1d6" />
      <pointLight position={[-3, -1, 2]} intensity={12} color="#8b6cff" />
      <pointLight position={[0, 1.2, 1.4]} intensity={4} color="#f5b942" distance={4} />

      <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.4}>
        <OpenBook accent={accent} />
      </Float>
      <FloatingBook position={[-2.6, 1.1, -1]} rotation={[0.3, 0.6, 0.2]} color="#d81b60" speed={1.6} />
      <FloatingBook position={[2.7, 0.9, -1.4]} rotation={[-0.2, -0.5, -0.3]} color="#00897b" speed={1.2} />
      <FloatingBook position={[2.2, -1.3, -0.5]} rotation={[0.4, 0.2, 0.5]} color="#f5b942" speed={1.9} />
      <FloatingBook position={[-2.3, -1.2, -0.8]} rotation={[-0.3, -0.4, -0.2]} color="#1e88e5" speed={1.3} />

      <Sparkles count={70} scale={[7, 4, 3]} size={2.4} speed={0.35} color="#f5d58a" />
      <ContactShadows position={[0, -1.7, 0]} opacity={0.35} scale={9} blur={2.6} far={3} />
    </Canvas>
  )
}
