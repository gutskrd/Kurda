package app.hevalo.glass

/**
 * The glass as a runtime shader: the same optics as @kurda/shared's glass.ts, line for line, so the phone and the
 * website bend, tint and light alike. `content` is what lies behind the glass; every length is in pixels.
 * mobile/src/theme/glassShader.test.ts compiles and runs this source in Skia, the engine Android draws with.
 */
internal const val GLASS_SHADER = """
uniform shader content;
uniform float2 size;
uniform float radius;
uniform float bezel;
uniform float thickness;
uniform float density;
uniform half3 tint;
uniform float2 optics;

const float IOR = 1.5;
const float DISPERSION = 0.07;
const float2 LIGHT = float2(-0.37, -0.93);
const float VEIL_RIM = 0.12;
const float VEIL_MIDDLE = 0.88;
const float VEIL_REACH = 0.45;

half4 main(float2 p) {
  float2 mid = size * 0.5;
  float r = min(radius, min(mid.x, mid.y));
  float2 c = p - mid;
  float2 q = abs(c) - (mid - r);
  float2 o = max(q, float2(0.0));
  float corner = length(o);
  float inside = r - corner - min(max(q.x, q.y), 0.0);
  if (inside <= 0.0) {
    return half4(0.0);
  }

  float2 n = float2(0.0, 1.0);
  if (q.x > 0.0 && q.y > 0.0) {
    n = o / corner;
  } else if (q.x > q.y) {
    n = float2(1.0, 0.0);
  }
  if (c.x < 0.0) { n.x = -n.x; }
  if (c.y < 0.0) { n.y = -n.y; }

  // The rim's squircle bends a ray inward by Snell's law; past the bezel the glass is flat and nothing bends.
  float t = inside / bezel;
  float bend = 0.0;
  if (t < 1.0) {
    float s = 1.0 - t;
    float lift = 1.0 - s * s * s * s;
    float slope = lift > 0.000001 ? s * s * s / pow(lift, 0.75) : 1000000.0;
    float tilt = atan(slope * thickness / bezel);
    float turn = tilt - asin(sin(tilt) / IOR);
    bend = (pow(lift, 0.25) * thickness + 2.0 * density) * tan(turn) * sqrt(s);
  }
  float2 d = -n * bend;

  // Red bends a little further than green and blue a little less, as light does in real glass.
  half3 seen = half3(
    content.eval(p + d * (1.0 + DISPERSION)).r,
    content.eval(p + d).g,
    content.eval(p + d * (1.0 - DISPERSION)).b);
  half grey = dot(seen, half3(0.2126, 0.7152, 0.0722));
  seen = clamp(mix(half3(grey), seen, half(optics.x)) * half(optics.y), half3(0.0), half3(1.0));

  // The tint is clear on the outer rim, where the page bends most, and deep from there in, where the words are.
  float k = clamp(t / VEIL_REACH, 0.0, 1.0);
  float veil = (VEIL_RIM + (VEIL_MIDDLE - VEIL_RIM) * k * k * (3.0 - 2.0 * k)) * min(inside, 1.0);
  half3 glass = mix(seen, tint, half(veil));

  // A fine line of light on the edge, brightest where it faces the light, and a faint sheen inside it.
  float facing = dot(n, LIGHT);
  float rim = max(0.0, 1.0 - abs(inside - 0.6 * density) / (0.9 * density));
  float lit = 0.9 * pow(max(facing, 0.0), 1.2) + 0.4 * pow(max(-facing, 0.0), 1.2) + 0.12;
  float sheen = 0.16 * pow(1.0 - min(inside / bezel, 1.0), 3.0) * max(facing, 0.0);
  float shine = min(1.0, rim * lit + sheen);
  glass = mix(glass, half3(1.0), half(shine));

  half a = half(clamp(inside, 0.0, 1.0));
  return half4(glass * a, a);
}
"""
