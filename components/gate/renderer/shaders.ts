/**
 * Shaders of the gate scene. Every colour is premultiplied by alpha. Plate
 * coordinates are gate.jpg pixels; screen coordinates are device pixels with
 * the origin at the top left, like CSS.
 */

const header = /* glsl */ `#version 300 es
precision highp float;
`;

/** Screen pixel of this fragment, top-left origin. */
const screenPixel = /* glsl */ `
uniform vec2 uViewport;
vec2 screenPixel() {
  return vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y);
}
`;

/**
 * Shared by the square and the road: the poster dissolves into square-golden,
 * at once under the leaves (they are about to uncover it), gradually elsewhere.
 * On portrait screens square-golden only covers the band of gate.jpg, so the
 * sky and road above and below it stay on the tall poster.
 */
const plates = /* glsl */ `
uniform sampler2D uPoster;
uniform vec4 uPosterRect;   // poster placement on the plate: xy origin, zw size
uniform sampler2D uSquare;
uniform vec2 uPlate;        // gate.jpg size
uniform vec4 uLeafRect;     // where the closed leaves stand: x0 y0 x1 y1
uniform float uDissolve;    // 0 poster … 1 square, everywhere
uniform float uUnder;       // 0 poster … 1 square, under the leaves
uniform float uBand;        // 1 when the poster reaches beyond square-golden
uniform float uPosterLod;   // < 0: mipmapped; otherwise this level, as the browser draws the <img>

float box(vec2 p, vec4 r, float soft) {
  vec2 a = smoothstep(r.xy - soft, r.xy + soft, p);
  vec2 b = smoothstep(r.zw + soft, r.zw - soft, p);
  return a.x * a.y * b.x * b.y;
}

vec3 plateColour(vec2 p) {
  vec2 posterUv = (p - uPosterRect.xy) / uPosterRect.zw;
  vec3 poster = uPosterLod < 0.0 ? texture(uPoster, posterUv).rgb : textureLod(uPoster, posterUv, uPosterLod).rgb;
  vec3 square = texture(uSquare, p / uPlate).rgb;
  float mixAmount = max(uDissolve, uUnder * box(p, uLeafRect, 10.0));
  // The seam lies outside square-golden, so its own frame is never touched.
  float band = mix(1.0, smoothstep(-48.0, 0.0, p.y) * smoothstep(uPlate.y + 48.0, uPlate.y, p.y), uBand);
  return mix(poster, square, mixAmount * band);
}
`;

export const fullscreenVertex = /* glsl */ `${header}
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}
`;

/** The square (and, at rest, the whole poster) as a flat backdrop far behind the gate. */
export const backdropFragment = /* glsl */ `${header}
${screenPixel}
${plates}
uniform vec2 uOrigin;   // window origin, device px
uniform float uScale;   // device px per plate px
uniform float uAlpha;
uniform vec4 uPosterScreen; // when z > 0: the <img> box on screen, to sample the poster exactly as the browser does
out vec4 outColour;
void main() {
  if (uPosterScreen.z > 0.0) {
    vec2 uv = (screenPixel() - uPosterScreen.xy) / uPosterScreen.zw;
    outColour = vec4(textureLod(uPoster, uv, max(uPosterLod, 0.0)).rgb * uAlpha, uAlpha);
    return;
  }
  vec2 p = (screenPixel() - uOrigin) / uScale;
  outColour = vec4(plateColour(p) * uAlpha, uAlpha);
}
`;

/** World-space quads seen through the moving camera. */
export const worldVertex = /* glsl */ `${header}
in vec3 aWorld;
in vec2 aUv;
uniform vec2 uViewport;
uniform vec2 uOrigin;
uniform float uScale;
uniform vec2 uCentre;
uniform float uFocal;
uniform float uCameraZ;
uniform vec2 uLift;     // world offset of a hung part (the board on its chains), zero for everything else
out vec2 vUv;
out vec3 vWorld;
const float near = 8.0;
void main() {
  vec3 world = aWorld + vec3(uLift, 0.0);
  float w = world.z - uCameraZ;
  // screen = origin + scale * (centre + focal * xy / w), kept multiplied by w so the GPU clips at the near plane
  vec2 screen = (uOrigin + uScale * uCentre) * w + uScale * uFocal * world.xy;
  gl_Position = vec4(2.0 * screen.x / uViewport.x - w, w - 2.0 * screen.y / uViewport.y, w - 2.0 * near, w);
  vUv = aUv;
  vWorld = world;
}
`;

/** The road in front of the gate, textured by projecting the plate from the rest camera. */
export const roadFragment = /* glsl */ `${header}
${plates}
in vec3 vWorld;
uniform vec2 uCentre;
uniform float uFocal0;
uniform vec2 uFeather;  // rows over which the road fades in below the gate line
out vec4 outColour;
void main() {
  vec2 p = uCentre + uFocal0 * vWorld.xy / vWorld.z;
  float a = smoothstep(uFeather.x, uFeather.y, p.y);
  outColour = vec4(plateColour(p) * a, a);
}
`;

/** A cut-out layer: leaf or card. */
export const spriteFragment = /* glsl */ `${header}
in vec2 vUv;
uniform sampler2D uTexture;
uniform float uShade;
out vec4 outColour;
void main() {
  vec4 c = texture(uTexture, vUv);
  outColour = vec4(c.rgb * uShade, c.a);
}
`;

/**
 * A leaf's shadow on the road: its alpha, blurred more the further the
 * shadow falls from the foot of the leaf. Drawn with a multiply blend.
 */
export const shadowFragment = /* glsl */ `${header}
in vec2 vUv;
uniform sampler2D uTexture;
uniform float uStrength;
uniform float uSoftness;  // extra mip levels at the far end of the shadow
out vec4 outColour;
void main() {
  float reach = 1.0 - vUv.y;
  float a = textureLod(uTexture, vUv, 1.0 + uSoftness * reach).a;
  // A contact shadow: darkest where the leaf meets the road, gone well before its far edge.
  float k = uStrength * a * pow(1.0 - reach, 1.6);
  // Golden-hour shade is cooler than the light: red goes first.
  outColour = vec4(k * vec3(1.0, 0.93, 0.82), 1.0);
}
`;

/** Near layers smeared towards the vanishing point while the camera is fast. */
export const blurFragment = /* glsl */ `${header}
${screenPixel}
uniform sampler2D uLayer;
uniform vec2 uCentre;    // vanishing point, device px
uniform float uAmount;   // smear as a share of the distance to the vanishing point
out vec4 outColour;
const int taps = 14;
void main() {
  vec2 pixel = screenPixel();
  vec2 towards = (uCentre - pixel) * uAmount;
  // Interleaved gradient noise hides the steps between taps.
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec4 sum = vec4(0.0);
  for (int i = 0; i < taps; i++) {
    vec2 at = pixel + towards * ((float(i) + jitter) / float(taps));
    sum += texture(uLayer, vec2(at.x, uViewport.y - at.y) / uViewport);
  }
  outColour = sum / float(taps);
}
`;
