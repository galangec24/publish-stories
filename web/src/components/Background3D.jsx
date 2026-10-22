import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { useTheme } from '../lib/theme'

function cssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** Slowly drifting points of light, like dust in a reading lamp's beam. */
function Dust({ count, color }) {
  const points = useRef()
  const positions = useMemo(() => {
    const p = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 22
      p[i * 3 + 1] = (Math.random() - 0.5) * 14
      p[i * 3 + 2] = -Math.random() * 12
    }
    return p
  }, [count])

  useFrame(({ clock, pointer }) => {
    const t = clock.elapsedTime
    points.current.rotation.y = t * 0.012 + pointer.x * 0.08
    points.current.rotation.x = Math.sin(t * 0.05) * 0.05 + pointer.y * 0.05
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.06} sizeAttenuation transparent opacity={0.7} depthWrite={false} />
    </points>
  )
}

/** Translucent pages tumbling slowly in the distance. */
function Pages({ count, color }) {
  const group = useRef()
  const pages = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        position: [(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, -3 - Math.random() * 8],
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, 0],
        speed: 0.05 + Math.random() * 0.12,
        drift: 0.15 + Math.random() * 0.25,
        scale: 0.5 + Math.random() * 0.7,
      })),
    [count],
  )

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    group.current.children.forEach((mesh, i) => {
      const p = pages[i]
      mesh.rotation.x += delta * p.speed
      mesh.rotation.y += delta * p.speed * 0.7
      mesh.position.y = p.position[1] + Math.sin(t * p.drift + i) * 0.6
    })
  })

  return (
    <group ref={group}>
      {pages.map((p, i) => (
        <mesh key={i} position={p.position} rotation={p.rotation} scale={p.scale}>
          <planeGeometry args={[0.9, 1.25]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Fixed full-screen 3D layer behind every page. Light on resources: low pixel
 * ratio, no antialiasing, paused while the tab is hidden, and skipped entirely
 * for people who prefer reduced motion.
 */
export default function Background3D() {
  const theme = useTheme()
  const [visible, setVisible] = useState(!document.hidden)
  const [colors, setColors] = useState({ dust: '#f5b942', page: '#8b6cff' })
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const small = window.innerWidth < 640

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Re-read the theme's colours whenever the theme changes.
  useEffect(() => {
    setColors({ dust: cssColor('--accent', '#f5b942'), page: cssColor('--brand', '#8b6cff') })
  }, [theme])

  if (reduced) return null
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 opacity-80" aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 60 }}
        dpr={[1, 1.25]}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        frameloop={visible ? 'always' : 'never'}
        // The layer itself ignores clicks; track the mouse on the page for parallax.
        eventSource={document.body}
        eventPrefix="client"
      >
        <Dust count={small ? 250 : 600} color={colors.dust} />
        <Pages count={small ? 6 : 14} color={colors.page} />
      </Canvas>
    </div>
  )
}
