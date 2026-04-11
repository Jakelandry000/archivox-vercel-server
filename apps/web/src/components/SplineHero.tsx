import Spline from '@splinetool/react-spline/next'

interface SplineHeroProps {
  scene: string
  className?: string
}

/**
 * Full-viewport Spline 3D scene.
 * Uses @splinetool/react-spline/next for automatic SSR placeholder.
 *
 * Usage:
 *   <SplineHero scene="https://prod.spline.design/your-scene-id/scene.splinecode" />
 *
 * Get scene URLs from: https://spline.design → Export → Copy Link
 */
export function SplineHero({ scene, className }: SplineHeroProps) {
  return (
    <div style={{ width: '100%', height: '100vh' }} className={className}>
      <Spline scene={scene} />
    </div>
  )
}
