// freeEngine 2.5D WebGPU 动态次世代背景着色器
struct Uniforms {
  resolution: vec2<f32>,
  time: f32,
  transition: f32,
  mouse: vec2<f32>,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );
  var out: VertexOutput;
  out.position = vec4<f32>(pos[vertex_index], 0.0, 1.0);
  out.uv = (pos[vertex_index] + vec2<f32>(1.0, 1.0)) * 0.5;
  return out;
}

// 伪随机与连续噪声
fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2<f32>(0.0, 0.0)), hash(i + vec2<f32>(1.0, 0.0)), u.x),
             mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let aspect = u.resolution.x / max(u.resolution.y, 1.0);
  let centered_uv = (uv - 0.5) * vec2<f32>(aspect, 1.0);

  let t = u.time * 0.6;
  
  // 1. 深空底色与径向晕影
  let dist = length(centered_uv);
  let vignette = 1.0 - smoothstep(0.3, 1.2, dist);
  var col = mix(vec3<f32>(0.02, 0.03, 0.07), vec3<f32>(0.005, 0.008, 0.02), dist);

  // 2. 2.5D 透视网格地平线 (Cyber Grid)
  let horizon_y = centered_uv.y + 0.15;
  if (horizon_y < 0.0) {
    let depth = 0.15 / abs(horizon_y);
    let grid_x = centered_uv.x * depth;
    let grid_z = depth + t * 1.5;
    
    let line_x = abs(fract(grid_x * 2.0) - 0.5);
    let line_z = abs(fract(grid_z * 0.8) - 0.5);
    let grid_line = smoothstep(0.06, 0.0, min(line_x, line_z)) * exp(-depth * 0.25);
    
    // 青色/紫罗兰发光网格线
    let grid_color = mix(vec3<f32>(0.1, 0.5, 0.9), vec3<f32>(0.7, 0.2, 0.9), sin(grid_z * 0.2) * 0.5 + 0.5);
    col += grid_color * grid_line * 0.7;
  }

  // 3. 动态光能流体星云 (Energy Waves)
  let wave1 = sin(centered_uv.x * 4.0 + t + noise(centered_uv * 3.0 + t * 0.5) * 2.0);
  let wave2 = cos(centered_uv.y * 3.0 - t * 0.8 + noise(centered_uv * 2.5 - t * 0.3) * 2.5);
  let wave_beam = smoothstep(0.4, 0.0, abs(centered_uv.y - wave1 * 0.12 - 0.1));
  
  col += vec3<f32>(0.0, 0.6, 0.85) * wave_beam * 0.45;
  col += vec3<f32>(0.55, 0.15, 0.8) * abs(wave2) * 0.18;

  // 4. 发光动态星尘粒子 (Light Dust)
  for (var i = 0; i < 6; i = i + 1) {
    let fi = f32(i);
    let speed = 0.2 + fi * 0.08;
    let p_pos = vec2<f32>(
      sin(t * speed + fi * 1.618) * 0.8 * aspect,
      cos(t * speed * 0.7 + fi * 2.718) * 0.5
    );
    let p_dist = length(centered_uv - p_pos);
    let glow = 0.003 / (p_dist * p_dist + 0.002);
    col += vec3<f32>(0.4, 0.8, 1.0) * glow * 0.25;
  }

  // 5. 过场转场遮罩效果 (Transition effect)
  if (u.transition > 0.0) {
    let trans = u.transition;
    // 带有径向网格溶解的扫描波
    let wipe = smoothstep(trans - 0.2, trans + 0.1, dist + noise(uv * 10.0) * 0.15);
    col = mix(col, vec3<f32>(0.0, 0.0, 0.0), 1.0 - wipe);
    // 冲击光环
    let edge = smoothstep(0.08, 0.0, abs(dist - trans * 1.5));
    col += vec3<f32>(0.3, 0.8, 1.0) * edge * 0.8;
  }

  col *= vignette;
  return vec4<f32>(col, 1.0);
}
