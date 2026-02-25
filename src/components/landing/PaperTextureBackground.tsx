/**
 * Paper texture background using WebGL shader for grainy effect.
 */
import { PaperTexture } from '@paper-design/shaders-react'

export function PaperTextureBackground() {
  return (
    <PaperTexture
      style={{ position: 'absolute', inset: 0, backgroundColor: '#1B4332' }}
      colorBack="#0D261C"
      colorFront="#1B4332"
      contrast={0.78}
      roughness={0.3}
      fiber={0.11}
      fiberSize={0.19}
      crumples={0.17}
      crumpleSize={0.18}
      folds={0.23}
      foldCount={5}
      drops={0}
      fade={0}
      seed={0}
      scale={0.5}
    />
  )
}
