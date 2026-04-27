'use client';

import { useEffect, useRef } from 'react';
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  FogExp2,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { GeoCountryDrilldownSnapshot, GeoDealer } from '@/lib/geo-intelligence/types';
import {
  clamp,
  type GeoSceneMarker,
  type GeoSceneModel,
} from './geo-globe-model';
import { createGeoHeatmapTexture } from './geo-heatmap-texture';

type Dimensions = {
  width: number;
  height: number;
};

interface GeoThreeGlobeSceneProps {
  dimensions: Dimensions;
  sceneModel: GeoSceneModel;
  drilldown: GeoCountryDrilldownSnapshot | null;
  selectedDealer: GeoDealer | null;
  zoomCommand?: { id: number; direction: 'in' | 'out' } | null;
  onSelectDealer: (dealer: GeoDealer | null) => void;
  onHoverLabel: (label: string | null) => void;
}

type Runtime = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  setFocus: (lat: number, lng: number, distance: number) => void;
  zoom: (direction: 'in' | 'out') => void;
  clearFocus: () => void;
  scheduleAutoRotate: (delay?: number) => void;
};

const DEG = Math.PI / 180;
const GLOBE_RADIUS = 2;
const DEFAULT_CAMERA_DISTANCE = 9;

function latLngToVector3(lat: number, lng: number, radius = GLOBE_RADIUS) {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;

  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function slerpUnitVectors(start: Vector3, end: Vector3, t: number) {
  const dot = clamp(start.dot(end), -1, 1);
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  if (sinOmega < 0.0001) return start.clone().lerp(end, t).normalize();

  const startScale = Math.sin((1 - t) * omega) / sinOmega;
  const endScale = Math.sin(t * omega) / sinOmega;
  return start.clone().multiplyScalar(startScale).add(end.clone().multiplyScalar(endScale)).normalize();
}

function buildArcPoints(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  kind: 'dealer' | 'ecosystem' | undefined,
) {
  const start = latLngToVector3(startLat, startLng, 1).normalize();
  const end = latLngToVector3(endLat, endLng, 1).normalize();
  const angle = start.angleTo(end);
  const lift = kind === 'ecosystem'
    ? 0.16 + angle * 0.2
    : 0.22 + angle * 0.34;
  const segments = kind === 'ecosystem' ? 32 : 42;
  const points: Vector3[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const arcLift = Math.sin(Math.PI * t) * lift;
    const radius = GLOBE_RADIUS + 0.045 + arcLift;
    points.push(slerpUnitVectors(start, end, t).multiplyScalar(radius));
  }

  return points;
}

function markerColor(marker: GeoSceneMarker, selectedDealer: GeoDealer | null) {
  if (marker.kind === 'origin') return '#fff3c4';
  if (marker.kind === 'city') return '#dbeafe';
  if (marker.dealer?.id === selectedDealer?.id) return '#ffffff';
  if (marker.kind === 'dealer-active') return '#ff4966';
  return '#c78791';
}

function disposeMaterial(material: Material) {
  const maybeWithMaps = material as Material & {
    map?: Texture | null;
    bumpMap?: Texture | null;
    specularMap?: Texture | null;
    emissiveMap?: Texture | null;
  };

  maybeWithMaps.map?.dispose();
  maybeWithMaps.bumpMap?.dispose();
  maybeWithMaps.specularMap?.dispose();
  maybeWithMaps.emissiveMap?.dispose();
  material.dispose();
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    const mesh = child as Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function createStarfield(count: number, radius: number) {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new Color();

  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const distance = radius * (0.62 + Math.random() * 0.38);
    positions.push(
      distance * Math.sin(phi) * Math.cos(theta),
      distance * Math.cos(phi),
      distance * Math.sin(phi) * Math.sin(theta),
    );

    color.set(Math.random() > 0.88 ? '#ffd4dc' : '#f8fbff');
    const strength = 0.35 + Math.random() * 0.55;
    colors.push(color.r * strength, color.g * strength, color.b * strength);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

  return new Points(
    geometry,
    new PointsMaterial({
      size: 0.018,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
}

export function GeoThreeGlobeScene({
  dimensions,
  sceneModel,
  drilldown,
  selectedDealer,
  zoomCommand,
  onSelectDealer,
  onHoverLabel,
}: GeoThreeGlobeSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const lastZoomCommandRef = useRef<number | null>(null);
  const autoRotateTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || dimensions.width <= 0 || dimensions.height <= 0) return;

    host.replaceChildren();
    onHoverLabel(null);

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(dimensions.width, dimensions.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dimensions.width < 760 ? 1.2 : 1.55));
    renderer.domElement.className = 'h-full w-full';
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.fog = new FogExp2('#13213a', 0.013);

    const camera = new PerspectiveCamera(34, dimensions.width / dimensions.height, 0.1, 90);
    camera.position.copy(latLngToVector3(24, -10, DEFAULT_CAMERA_DISTANCE));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 4.2;
    controls.maxDistance = 12;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.56;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.18;

    const focusRef: { target: Vector3 | null } = { target: null };
    const scheduleAutoRotate = (delay = 1800) => {
      if (autoRotateTimeoutRef.current !== null) {
        window.clearTimeout(autoRotateTimeoutRef.current);
      }
      autoRotateTimeoutRef.current = window.setTimeout(() => {
        controls.autoRotate = true;
        autoRotateTimeoutRef.current = null;
      }, delay);
    };
    const setFocus = (lat: number, lng: number, distance: number) => {
      focusRef.target = latLngToVector3(lat, lng, distance);
      controls.autoRotate = false;
      scheduleAutoRotate(2400);
    };
    const clearFocus = () => {
      focusRef.target = null;
    };

    const zoom = (direction: 'in' | 'out') => {
      const currentDistance = camera.position.length();
      const nextDistance = clamp(
        currentDistance * (direction === 'in' ? 0.78 : 1.24),
        controls.minDistance,
        controls.maxDistance,
      );
      focusRef.target = camera.position.clone().normalize().multiplyScalar(nextDistance);
      controls.autoRotate = false;
      scheduleAutoRotate(1600);
    };

    runtimeRef.current = { camera, controls, setFocus, zoom, clearFocus, scheduleAutoRotate };

    const ambient = new AmbientLight('#eef4ff', 0.54);
    const sun = new DirectionalLight('#fff6de', 2.9);
    sun.position.set(-4.5, 2.8, 3.2);
    const rim = new DirectionalLight('#ff7a8f', 0.92);
    rim.position.set(4.4, 1.2, -4.2);
    const fill = new DirectionalLight('#88abff', 0.68);
    fill.position.set(-3.2, -2.1, 3.2);
    scene.add(ambient, sun, rim, fill);

    const earthGroup = new Group();
    scene.add(earthGroup);
    scene.add(createStarfield(dimensions.width < 760 ? 680 : 1050, 18));

    const loader = new TextureLoader();
    const earthMaterial = new MeshPhongMaterial({
      color: '#ffffff',
      emissive: '#172338',
      emissiveIntensity: 0.12,
      specular: '#345a87',
      shininess: 18,
    });

    loader.load('/data/geo/textures/earth-day.jpg', (texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      earthMaterial.map = texture;
      earthMaterial.needsUpdate = true;
    });
    loader.load('/data/geo/textures/earth-topology.png', (texture) => {
      texture.anisotropy = 3;
      earthMaterial.bumpMap = texture;
      earthMaterial.bumpScale = 0.035;
      earthMaterial.needsUpdate = true;
    });
    loader.load('/data/geo/textures/earth-water.png', (texture) => {
      texture.anisotropy = 3;
      earthMaterial.specularMap = texture;
      earthMaterial.needsUpdate = true;
    });
    loader.load('/data/geo/textures/earth-night.jpg', (texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 3;
      earthMaterial.emissiveMap = texture;
      earthMaterial.emissive = new Color('#f5b270');
      earthMaterial.emissiveIntensity = 0.16;
      earthMaterial.needsUpdate = true;
    });

    const earth = new Mesh(new SphereGeometry(GLOBE_RADIUS, 96, 64), earthMaterial);
    earthGroup.add(earth);

    const atmosphere = new Mesh(
      new SphereGeometry(GLOBE_RADIUS * 1.055, 80, 48),
      new MeshBasicMaterial({
        color: '#ff6a7f',
        transparent: true,
        opacity: 0.19,
        side: BackSide,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    earthGroup.add(atmosphere);

    loader.load('/data/geo/textures/earth-clouds.png', (texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.anisotropy = 3;
      const clouds = new Mesh(
        new SphereGeometry(GLOBE_RADIUS * 1.012, 72, 42),
        new MeshPhongMaterial({
          map: texture,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      );
      clouds.name = 'cloud-layer';
      earthGroup.add(clouds);
    });

    const heatTexture = createGeoHeatmapTexture(sceneModel.heatPoints, dimensions.width < 760 ? 768 : 1280);
    if (heatTexture) {
      const heatOverlay = new Mesh(
        new SphereGeometry(GLOBE_RADIUS * 1.007, 96, 64),
        new MeshBasicMaterial({
          map: heatTexture,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      heatOverlay.renderOrder = 3;
      earthGroup.add(heatOverlay);
    }

    const pickableMarkers = sceneModel.markers.filter((marker) => marker.kind !== 'city');
    const markerGeometry = new SphereGeometry(0.032, 16, 10);
    const markerMaterial = new MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#ff405b',
      emissiveIntensity: 0.82,
      roughness: 0.48,
      metalness: 0.08,
      vertexColors: true,
    });
    const markerMesh = new InstancedMesh(markerGeometry, markerMaterial, Math.max(pickableMarkers.length, 1));
    markerMesh.userData.markers = pickableMarkers;
    const markerMatrix = new Matrix4();
    pickableMarkers.forEach((marker, index) => {
      const position = latLngToVector3(marker.lat, marker.lng, GLOBE_RADIUS * (1.018 + marker.altitude));
      const markerScale = marker.kind === 'origin' ? 1.45 : marker.size * 0.92;
      markerMatrix.compose(position, new Quaternion(), new Vector3(markerScale, markerScale, markerScale));
      markerMesh.setMatrixAt(index, markerMatrix);
      markerMesh.setColorAt(index, new Color(markerColor(marker, selectedDealer)));
    });
    markerMesh.instanceMatrix.needsUpdate = true;
    if (markerMesh.instanceColor) markerMesh.instanceColor.needsUpdate = true;
    earthGroup.add(markerMesh);

    const routePulseGeometry = new SphereGeometry(0.021, 12, 8);
    const routePulses: Array<{
      mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
      points: Vector3[];
      speed: number;
      offset: number;
    }> = [];

    for (const arc of sceneModel.arcs) {
      const selected = selectedDealer && arc.id === `dealer-arc:${selectedDealer.id}`;
      const points = buildArcPoints(arc.startLat, arc.startLng, arc.endLat, arc.endLng, arc.kind);
      const curve = new CatmullRomCurve3(points);
      const tubeRadius = selected ? 0.008 : arc.kind === 'ecosystem' ? 0.0035 : 0.0055;
      const routeMaterial = new MeshBasicMaterial({
        color: selected ? '#ffffff' : arc.kind === 'ecosystem' ? '#f59e0b' : '#ff3655',
        transparent: true,
        opacity: selected ? 0.78 : selectedDealer ? 0.2 : arc.kind === 'ecosystem' ? 0.18 : 0.38,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const routeMesh = new Mesh(new TubeGeometry(curve, arc.kind === 'ecosystem' ? 36 : 48, tubeRadius, 6, false), routeMaterial);
      earthGroup.add(routeMesh);

      const pulseMaterial = new MeshBasicMaterial({
        color: selected ? '#ffffff' : arc.kind === 'ecosystem' ? '#ffd08a' : '#ff92a2',
        transparent: true,
        opacity: selected ? 0.92 : 0.58,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const pulse = new Mesh(routePulseGeometry, pulseMaterial);
      pulse.scale.setScalar(selected ? 1.3 : 0.9);
      earthGroup.add(pulse);
      routePulses.push({
        mesh: pulse,
        points,
        speed: arc.kind === 'ecosystem' ? 0.055 : 0.085,
        offset: Math.random(),
      });
    }

    const pointer = new Vector2();
    const raycaster = new Raycaster();
    let hoveredMarkerId: string | null = null;
    let animationFrame = 0;
    let previous = performance.now();

    const updatePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerMove = (event: PointerEvent) => {
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(markerMesh, false)[0];
      const marker = hit?.instanceId !== undefined ? pickableMarkers[hit.instanceId] : null;

      if (marker?.id !== hoveredMarkerId) {
        hoveredMarkerId = marker?.id ?? null;
        onHoverLabel(marker?.label ?? null);
        renderer.domElement.style.cursor = marker ? 'pointer' : 'grab';
      }
    };

    const handlePointerLeave = () => {
      hoveredMarkerId = null;
      onHoverLabel(null);
      renderer.domElement.style.cursor = 'grab';
      scheduleAutoRotate(1800);
    };

    const handlePointerDown = () => {
      controls.autoRotate = false;
      clearFocus();
      if (autoRotateTimeoutRef.current !== null) {
        window.clearTimeout(autoRotateTimeoutRef.current);
        autoRotateTimeoutRef.current = null;
      }
      renderer.domElement.style.cursor = 'grabbing';
    };

    const handlePointerUp = (event: PointerEvent) => {
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(markerMesh, false)[0];
      const marker = hit?.instanceId !== undefined ? pickableMarkers[hit.instanceId] : null;
      renderer.domElement.style.cursor = marker ? 'pointer' : 'grab';

      if (marker?.dealer) {
        onSelectDealer(marker.dealer);
      } else {
        scheduleAutoRotate(1400);
      }
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const animate = (now: number) => {
      const dt = Math.min(0.04, (now - previous) / 1000);
      previous = now;

      const cloudLayer = earthGroup.getObjectByName('cloud-layer');
      if (cloudLayer) cloudLayer.rotation.y += dt * 0.005;

      for (const pulse of routePulses) {
        const t = (now * 0.001 * pulse.speed + pulse.offset) % 1;
        const index = Math.min(pulse.points.length - 1, Math.floor(t * (pulse.points.length - 1)));
        pulse.mesh.position.copy(pulse.points[index]);
      }

      if (focusRef.target) {
        camera.position.lerp(focusRef.target, 0.055);
        if (camera.position.distanceTo(focusRef.target) < 0.01) {
          focusRef.target = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    if (selectedDealer) {
      setFocus(selectedDealer.lat, selectedDealer.lng, 5.45);
    } else if (drilldown) {
      setFocus(drilldown.country.lat, drilldown.country.lng, 6.15);
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      if (autoRotateTimeoutRef.current !== null) {
        window.clearTimeout(autoRotateTimeoutRef.current);
        autoRotateTimeoutRef.current = null;
      }
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      runtimeRef.current = null;
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    dimensions.height,
    dimensions.width,
    drilldown,
    onHoverLabel,
    onSelectDealer,
    sceneModel,
    selectedDealer,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    if (selectedDealer) {
      runtime.setFocus(selectedDealer.lat, selectedDealer.lng, 5.45);
      return;
    }

    if (drilldown) {
      runtime.setFocus(drilldown.country.lat, drilldown.country.lng, 6.15);
      return;
    }

    runtime.setFocus(24, -10, DEFAULT_CAMERA_DISTANCE);
    runtime.scheduleAutoRotate(900);
  }, [drilldown, selectedDealer]);

  useEffect(() => {
    if (!zoomCommand || zoomCommand.id === lastZoomCommandRef.current) return;
    lastZoomCommandRef.current = zoomCommand.id;
    runtimeRef.current?.zoom(zoomCommand.direction);
  }, [zoomCommand]);

  return <div ref={hostRef} className="absolute inset-0" aria-label="Three.js globe renderer" />;
}
