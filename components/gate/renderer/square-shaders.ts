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
 * A prop in the light of the photograph. Its colour is the cut-out's own,
 * lit the way the plate is lit: the photograph's warm golden light at first,
 * then dusk's, lower and bluer, along the plate's own grade curve and with
 * its cooling on the way. Lamplight from the
 * strings and windows nearby lies warm across its face and on the edges that
 * face it; the board's lantern lights the wood around it and glows in its
 * glass. A touch of the surrounding air lies over all of it. Labels are paint
 * multiplied into the wood, gone where the grain runs deep.
 */
export const propFragment = /* glsl */ `${header}
${screenPixel}
in vec2 vUv;
uniform sampler2D uTexture;
uniform sampler2D uLabel;
uniform sampler2D uGolden;
uniform sampler2D uBase;
uniform float uHasLabel;
uniform vec3 uPaint;        // multiplied into the surface where the label covers it
uniform float uWear;        // 1: paint on weathered wood, lost in the grain
uniform float uLabelAmount; // how much of the label shows
uniform vec2 uOrigin;       // this prop's window, device px
uniform float uScale;
uniform vec2 uPlate;
uniform float uAirLod;
uniform vec3 uKey;          // golden-hour light on the props
uniform vec3 uDusk;         // what dusk does to it
uniform float uGrade;
uniform float uCool;
uniform vec3 uOpenTint;     // the lantern-lit board up close
uniform float uOpen;
uniform vec3 uWarm;         // lamplight colour × strength
uniform vec2 uWarmDir;      // towards the light, image uv
uniform vec2 uRimStep;      // a rim's width towards the light, image uv
uniform float uRamp;
uniform float uRim;
uniform float uHover;
uniform float uHoverLift;
uniform vec3 uHoverWarm;
uniform float uLantern;     // 0 off … 1 lit, flicker included
uniform vec2 uLanternAt;    // image uv
uniform vec2 uImage;        // image size, px
uniform float uLanternReach;
uniform float uLanternAmount;
uniform float uGlass;
uniform float uGlassGlow;
uniform vec3 uFlame;
uniform float uHaze;
uniform float uAlpha;
out vec4 outColour;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

void main() {
  vec4 c = texture(uTexture, vUv, 0.35);
  if (c.a < 0.001) {
    outColour = vec4(0.0);
    return;
  }
  vec3 albedo = c.rgb / c.a;

  if (uHasLabel > 0.0) {
    float cover = texture(uLabel, vUv, 0.6).a * uLabelAmount;
    if (uWear > 0.0) {
      // Paint keeps to the face of the boards and is gone from the dark of the grain.
      vec4 around = textureLod(uTexture, vUv, 3.5);
      float local = dot(around.rgb / max(around.a, 0.001), LUMA);
      float groove = (local - dot(albedo, LUMA)) * 5.0;
      cover *= (1.0 - smoothstep(0.04, 0.32, groove)) * 0.9;
    }
    albedo = mix(albedo, albedo * uPaint, cover);
  }

  vec3 light = uKey * mix(vec3(1.0), uDusk, uGrade);
  float bump = 4.0 * uGrade * (1.0 - uGrade) * uCool;
  light *= vec3(1.0 - 0.06 * bump, 1.0 - 0.03 * bump, 1.0 + 0.03 * bump);
  light = mix(light, uOpenTint, uOpen);
  vec3 colour = albedo * light;

  // Lamplight: a little across the face, more on the edges turned to it.
  float ramp = clamp(0.5 + dot(vUv - 0.5, uWarmDir) * 1.2, 0.0, 1.0);
  float rim = c.a * (1.0 - texture(uTexture, vUv + uRimStep, 1.0).a);
  vec3 warm = uWarm * (uRamp * ramp + uRim * rim) * (1.0 - uOpen);
  warm += uHoverWarm * uHover * (0.4 + 0.6 * ramp);
  colour += albedo * warm;
  colour *= 1.0 + uHoverLift * uHover;

  if (uLantern > 0.0) {
    float d = length((vUv - uLanternAt) * uImage);
    colour += albedo * uFlame * (uLantern * uLanternAmount / (1.0 + (d / uLanternReach) * (d / uLanternReach)));
    float t = clamp((uGlass - d) / (uGlass * 0.45), 0.0, 1.0);
    colour += uFlame * (uLantern * uGlassGlow * t * t * (3.0 - 2.0 * t));
  }

  vec2 plate = (screenPixel() - uOrigin) / uScale;
  vec2 puv = clamp(plate / uPlate, vec2(0.0), vec2(1.0));
  vec3 air = mix(textureLod(uGolden, puv, uAirLod).rgb, textureLod(uBase, puv, uAirLod).rgb, uGrade);
  colour = mix(colour, air, uHaze * (1.0 - uOpen));
  outColour = vec4(colour * c.a, c.a) * uAlpha;
}
`;

/** Contact shadow at a foot: a soft ellipse, multiplied into what lies beneath. */
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

/**
 * A prop's own silhouette laid on the ground behind it: sharp at its foot,
 * softer and fainter the further it falls, multiplied into the road.
 */
export const castFragment = /* glsl */ `${header}
in vec2 vUv;
uniform sampler2D uTexture;
uniform float uStrength;
out vec4 outColour;
void main() {
  float away = 1.0 - vUv.y;
  float a = texture(uTexture, vUv, 1.0 + away * 4.0).a;
  float k = uStrength * a * pow(1.0 - away, 1.4);
  outColour = vec4(k * vec3(1.0, 0.92, 0.84), 1.0);
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
