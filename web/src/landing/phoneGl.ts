import {
  BoxGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PMREMGenerator,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Shape,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * The front page's phone as a solid thing, drawn with WebGL behind the live
 * screen (Phone3D.tsx loads this module only when the page can use it).
 *
 * The CSS phone builds its edge out of flat slabs, which reads as a picture
 * of a phone. This one is modelled: a body with rounded aluminium sides
 * that curve into the front glass, the buttons and antenna lines on its
 * edges, a camera control set into the right side, and all of it lit by a
 * soft studio environment so the metal catches real highlights as it turns.
 *
 * Only the body is drawn here. The screen stays HTML on top of it, in the
 * reader's language, so this module draws the phone with exactly the
 * projection the page uses for that HTML: the camera stands where the CSS
 * perspective puts the eye, and each frame takes the same pose in the
 * page's own terms (pixels and degrees, y pointing down) that the HTML is
 * given in the same frame. The two meet at the front glass, where the black
 * the body draws runs a few pixels under the edge of the screen.
 */

/** The model's own size: the phone at 300 pixels wide, scaled to whatever width the page gives it. */
const MODEL = { width: 300, height: 618, radius: 52.5, depth: 30 } as const;
/** How far the rounded side reaches in from the outline, and how deep it runs toward the glass and the back. */
const SIDE = { inset: 3.5, round: 5 } as const;
/** Room around the phone on the canvas, so a turned edge, a button or the float never runs off it. */
export const PHONE_GL_MARGIN = 64;

const DEG = Math.PI / 180;

/** One frame of the phone's pose, as the page writes it: a lift and sway from the float, and the turn. */
export interface PhoneFrame {
  /** translateY of the float, in pixels (negative is up). */
  lift: number;
  /** rotateZ of the float, in degrees. */
  sway: number;
  /** rotateX, rotateY and rotateZ of the phone, in degrees, in that order. */
  x: number;
  y: number;
  z: number;
}

/** What the page tells the model about where it stands. */
export interface PhoneStage {
  /** The phone's laid-out size in pixels, before any transform. */
  width: number;
  height: number;
  /** The CSS perspective distance, and its origin in pixels from the phone box's top-left corner. */
  perspective: number;
  originX: number;
  originY: number;
  /** The metal's colour. */
  tone: string;
}

export interface PhoneGl {
  draw(frame: PhoneFrame): void;
  /** Sizes the canvas and the camera to the phone's current box. */
  fit(stage: PhoneStage): void;
  /** Paints the metal in a new colour, after the theme changes. */
  retone(tone: string): void;
  dispose(): void;
}

/** A rectangle with round corners, centred on the origin. */
function roundedRect(width: number, height: number, radius: number): Shape {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.absarc(x + width - radius, y + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(x + width, y + height - radius);
  shape.absarc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(x + radius, y + height);
  shape.absarc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + radius);
  shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/**
 * Where a button sits along a side, as the CSS phone places it: its top and
 * length as shares of the phone's height, measured from the top.
 */
const BUTTONS: readonly { side: -1 | 1; top: number; length: number; proud: number; kind: 'metal' | 'sapphire' }[] = [
  { side: -1, top: 0.16, length: 0.045, proud: 1.6, kind: 'metal' }, // the action button
  { side: -1, top: 0.24, length: 0.085, proud: 1.6, kind: 'metal' }, // volume up
  { side: -1, top: 0.345, length: 0.085, proud: 1.6, kind: 'metal' }, // volume down
  { side: 1, top: 0.27, length: 0.13, proud: 1.6, kind: 'metal' }, // the side button
  { side: 1, top: 0.6, length: 0.075, proud: 0.35, kind: 'sapphire' }, // the camera control, nearly flush
];

/** The thin lines across the band where the antennas break the metal, as shares of the height from the top. */
const ANTENNA_LINES = [0.085, 0.915] as const;

/**
 * Builds the phone on `canvas`, or returns null when the browser will not
 * give it a WebGL context; the CSS phone then stays as it is.
 */
export function mountPhoneGl(canvas: HTMLCanvasElement, stage: PhoneStage): PhoneGl | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.03).texture;
  scene.environment = environment;
  // one key light high on the reader's left, so a turned edge has a bright line along it
  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(-420, 620, 900);
  scene.add(key);

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const metal = new MeshPhysicalMaterial({ color: new Color(stage.tone), metalness: 1, roughness: 0.32, envMapIntensity: 1.15 });
  const glass = new MeshPhysicalMaterial({
    color: 0x040405,
    metalness: 0,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 0.9,
  });
  const sapphire = new MeshPhysicalMaterial({ color: 0x15161a, metalness: 0.3, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const band = new MeshPhysicalMaterial({ color: 0x8c8f95, metalness: 0, roughness: 0.55 });
  materials.push(metal, glass, sapphire, band);

  // the body: the outline less its rounded side, pushed out to depth with the side's curve as the bevel;
  // the caps (front glass and back) take the glass, the sides the metal
  const { width, height, radius, depth } = MODEL;
  const bodyShape = roundedRect(width - SIDE.inset * 2, height - SIDE.inset * 2, radius - SIDE.inset);
  const body = keep(
    new ExtrudeGeometry(bodyShape, {
      depth: depth - SIDE.round * 2,
      bevelEnabled: true,
      bevelThickness: SIDE.round,
      bevelSize: SIDE.inset,
      bevelSegments: 10,
      curveSegments: 48,
    }),
  );
  // the front glass at z = 0, where the page's screen is; the back at -depth
  body.translate(0, 0, -(depth - SIDE.round));

  const model = new Group();
  model.add(new Mesh(body, [glass, metal]));

  for (const button of BUTTONS) {
    const length = button.length * height;
    const geometry = keep(new RoundedBoxGeometry(5, length, button.kind === 'sapphire' ? 10 : 8.5, 4, 1.8));
    const mesh = new Mesh(geometry, button.kind === 'sapphire' ? sapphire : metal);
    mesh.position.set(button.side * (width / 2 - 2.5 + button.proud), height / 2 - (button.top * height + length / 2), -depth / 2);
    model.add(mesh);
  }
  const line = keep(new BoxGeometry(1, 2.2, depth - SIDE.round * 2 + 0.5));
  for (const share of ANTENNA_LINES) {
    for (const side of [-1, 1] as const) {
      const mesh = new Mesh(line, band);
      mesh.position.set(side * (width / 2 - 0.35), height / 2 - share * height, -depth / 2);
      model.add(mesh);
    }
  }

  // the float wraps the turn, as .p3d-float wraps .p3d-rig on the page
  const float = new Group();
  const rig = new Group();
  rig.rotation.order = 'XYZ';
  rig.add(model);
  float.add(rig);
  scene.add(float);

  const camera = new PerspectiveCamera();
  const near = 10;
  const far = 6000;

  const fit = (next: PhoneStage): void => {
    const canvasWidth = next.width + PHONE_GL_MARGIN * 2;
    const canvasHeight = next.height + PHONE_GL_MARGIN * 2;
    renderer.setSize(canvasWidth, canvasHeight, false);
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    canvas.style.left = `${-PHONE_GL_MARGIN}px`;
    canvas.style.top = `${-PHONE_GL_MARGIN}px`;
    model.scale.setScalar(next.width / MODEL.width);
    // the eye: where the CSS perspective puts it, in a world whose origin is the phone box's centre and whose y points up
    const eyeX = next.originX - next.width / 2;
    const eyeY = next.height / 2 - next.originY;
    camera.position.set(eyeX, eyeY, next.perspective);
    camera.updateMatrixWorld();
    // an off-centre frustum that maps the plane z = 0 onto the canvas exactly, as the page's own perspective does
    const s = near / next.perspective;
    camera.projectionMatrix.makePerspective(
      (-canvasWidth / 2 - eyeX) * s,
      (canvasWidth / 2 - eyeX) * s,
      (canvasHeight / 2 - eyeY) * s,
      (-canvasHeight / 2 - eyeY) * s,
      near,
      far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  };
  fit(stage);

  return {
    draw(frame) {
      // the page's y points down: a lift up is a positive y here, and a turn about x or z goes the other way
      float.position.y = -frame.lift;
      float.rotation.z = -frame.sway * DEG;
      rig.rotation.set(-frame.x * DEG, frame.y * DEG, -frame.z * DEG);
      renderer.render(scene, camera);
    },
    fit,
    retone(tone) {
      metal.color.set(tone);
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
