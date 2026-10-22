import { Canvas, useFrame, useThree } from '@react-three/fiber'
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

/** Soft round glow texture, drawn once on a canvas. */
function useGlowTexture() {
  return useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(canvas)
  }, [])
}

/** A lamp-like glow that eases toward the mouse. */
function CursorGlow({ color }) {
  const sprite = useRef()
  const texture = useGlowTexture()
  const { viewport } = useThree()
  useFrame(({ pointer, clock }) => {
    const x = (pointer.x * viewport.width) / 2
    const y = (pointer.y * viewport.height) / 2
    sprite.current.position.x = THREE.MathUtils.lerp(sprite.current.position.x, x, 0.08)
    sprite.current.position.y = THREE.MathUtils.lerp(sprite.current.position.y, y, 0.08)
    const pulse = 3.2 + Math.sin(clock.elapsedTime * 1.4) * 0.25
    sprite.current.scale.set(pulse, pulse, 1)
  })
  return (
    <sprite ref={sprite} position={[0, 0, 0.5]}>
      <spriteMaterial map={texture} color={color} transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} />
    </sprite>
  )
}

/** Occasional shooting stars streaking across the sky. */
function ShootingStars({ count = 3, color }) {
  const group = useRef()
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({ delay: 1.5 + i * 2.7 + Math.random() * 3, active: false, t: 0 })),
    [count],
  )
  const { viewport } = useThree()

  function launch(star, mesh) {
    const w = viewport.width / 2
    const h = viewport.height / 2
    star.start = new THREE.Vector3(-w + Math.random() * w * 1.4, h * (0.4 + Math.random() * 0.6), -1 - Math.random() * 3)
    const angle = -0.35 - Math.random() * 0.35 // heading down-right
    star.dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)
    star.speed = 9 + Math.random() * 6
    star.life = 0.9 + Math.random() * 0.5
    star.t = 0
    star.active = true
    mesh.rotation.z = angle
  }

  useFrame((_, delta) => {
    group.current.children.forEach((mesh, i) => {
      const star = stars[i]
      if (!star.active) {
        star.delay -= delta
        mesh.visible = false
        if (star.delay <= 0) launch(star, mesh)
        return
      }
      star.t += delta
      const k = star.t / star.life
      mesh.visible = true
      mesh.position.copy(star.start).addScaledVector(star.dir, star.t * star.speed)
      mesh.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.9
      if (k >= 1) {
        star.active = false
        star.delay = 4 + Math.random() * 7
      }
    })
  })

  return (
    <group ref={group}>
      {stars.map((_, i) => (
        <mesh key={i} visible={false}>
          <planeGeometry args={[1.8, 0.025]} />
          <meshBasicMaterial color={color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
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
        <ShootingStars count={small ? 2 : 3} color="#fff4d6" />
        {!small && <CursorGlow color={colors.dust} />}
      </Canvas>
    </div>
  )
}
