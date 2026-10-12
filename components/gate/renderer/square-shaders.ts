/**
 * Shaders of the square at dusk. Colours are premultiplied; screen
 * coordinates are device pixels from the top left, plate coordinates are
 * square plate pixels.
 */

const header = /* glsl */ `#version 300 es
precision highp float;
`;

const screenPixel = /* glsl */ `
uniform vec2 uViewport;
vec2 screenPixel() {
  return vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y);
}
`;

/**
 * The plate: golden fades into dusk-base (the same grain, dusk's light),
 * cooled a touch on the way; each light then mixes in square-dusk where it
 * glows, with a soft bloom around it. Light ids are read without filtering.
 */
export const squareFragment = /* glsl */ `${header}
${screenPixel}
uniform vec2 uOrigin;      // plate window, device px
uniform float uScale;
uniform vec2 uPlate;       // plate size, px
uniform sampler2D uGolden;
uniform sampler2D uBase;
uniform sampler2D uLights; // rgb: square-dusk where it glows, a: how much
uniform sampler2D uIds;    // r: light id, g: bloom (unfiltered)
uniform sampler2D uLevels; // per light id: r level, g flicker
uniform float uGrade;      // 0 golden … 1 dusk
uniform float uCool;       // extra coolness halfway through
uniform float uBloom;
uniform float uLit;        // 0 before dusk textures are ready
uniform float uDim;        // darkens towards ink behind an open panel
out vec4 outColour;

void main() {
  vec2 p = (screenPixel() - uOrigin) / uScale;
  vec2 uv = p / uPlate;
  vec3 colour = texture(uGolden, uv).rgb;
  if (uLit > 0.0) {
    colour = mix(colour, texture(uBase, uv).rgb, uGrade);
    float bump = 4.0 * uGrade * (1.0 - uGrade) * uCool;
    colour *= vec3(1.0 - 0.06 * bump, 1.0 - 0.03 * bump, 1.0 + 0.03 * bump);

    ivec2 size = textureSize(uIds, 0);
    ivec2 texel = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);
    vec4 tag = texelFetch(uIds, texel, 0);
    int id = int(tag.r * 255.0 + 0.5);
    if (id > 0) {
      vec4 level = texelFetch(uLevels, ivec2(id, 0), 0);
      float flick = 0.94 + level.g * 0.12;
      vec4 light = texture(uLights, uv);
      colour = mix(colour, light.rgb * flick, light.a * level.r);
      float bloom = tag.g * tag.g * level.r * flick * uBloom;
      colour += vec3(1.0, 0.7, 0.38) * bloom * (1.0 - colour * 0.6);
    }
  }
  colour = mix(colour, colour * vec3(0.55, 0.5, 0.52), uDim);
  outColour = vec4(colour, 1.0);
}
`;

/** A quad given by its four corners in device pixels. */
export const screenVertex = /* glsl */ `${header}
in vec3 aWorld;   // xy: device px
in vec2 aUv;
uniform vec2 uViewport;
out vec2 vUv;
void main() {
  vec2 clip = vec2(2.0 * aWorld.x / uViewport.x - 1.0, 1.0 - 2.0 * aWorld.y / uViewport.y);
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = aUv;
}
`;

/**
 * A prop: a premultiplied cut-out in the light of the scene. Arms carry a
 * label painted on the wood: the ink takes the grain beneath it, so it reads
 * as paint rather than print.
 */
export const propFragment = /* glsl */ `${header}
in vec2 vUv;
uniform sampler2D uTexture;
uniform sampler2D uLabel;
uniform float uHasLabel;
uniform vec3 uInk;
uniform vec3 uTint;
uniform float uAlpha;
out vec4 outColour;
void main() {
  vec4 c = texture(uTexture, vUv);
  if (uHasLabel > 0.0) {
    float paint = texture(uLabel, vUv).a * 0.92;
    vec3 wood = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    float grain = dot(wood, vec3(0.299, 0.587, 0.114));
    vec3 ink = uInk * (0.7 + 0.45 * grain);
    c.rgb = mix(c.rgb, ink * c.a, paint * c.a);
  }
  outColour = vec4(c.rgb * uTint, c.a) * uAlpha;
}
`;

/** Contact shadow: a soft ellipse, multiplied into what lies beneath. */
export const contactFragment = /* glsl */ `${header}
in vec2 vUv;
uniform float uStrength;
out vec4 outColour;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float k = uStrength * (1.0 - smoothstep(0.0, 1.0, d)) * (1.0 - smoothstep(0.55, 1.0, d) * 0.5);
  // Shade on warm ground is cooler than the light: red goes first.
  outColour = vec4(k * vec3(1.0, 0.92, 0.84), 1.0);
}
`;

/** A warm glow added around a flame. */
export const glowFragment = /* glsl */ `${header}
in vec2 vUv;
uniform float uStrength;
out vec4 outColour;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float k = uStrength * exp(-d * d * 4.0) * (1.0 - smoothstep(0.85, 1.0, d));
  outColour = vec4(vec3(1.0, 0.66, 0.32) * k, 0.0);
}
`;

/**
 * The scene behind an opened panel, out of focus: a ring of samples from the
 * mipmapped frame, turned per pixel so the rings never line up.
 */
export const defocusFragment = /* glsl */ `${header}
${screenPixel}
uniform sampler2D uFrame;
uniform float uRadius;   // device px
uniform float uLod;
out vec4 outColour;
void main() {
  vec2 pixel = screenPixel();
  vec2 uv = vec2(pixel.x, uViewport.y - pixel.y) / uViewport;
  if (uRadius < 0.5) {
    outColour = texture(uFrame, uv);
    return;
  }
  float turn = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec4 sum = textureLod(uFrame, uv, uLod);
  for (int i = 0; i < 8; i++) {
    float a = turn + float(i) * 0.7853982;
    vec2 at = pixel + vec2(cos(a), sin(a)) * uRadius;
    sum += textureLod(uFrame, vec2(at.x, uViewport.y - at.y) / uViewport, uLod);
  }
  outColour = sum / 9.0;
}
`;
