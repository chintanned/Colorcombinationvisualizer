import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three-stdlib';
import { GLTFLoader } from 'three-stdlib';
import { OBJLoader } from 'three-stdlib';
import { OrbitControls } from 'three-stdlib';
import { TransformControls } from 'three-stdlib';
import { Layers, Box as BoxIcon, Check, Upload, Trash2, Info, RefreshCw, ZoomIn, FileType, MousePointer2, Move, Rotate3D } from 'lucide-react';

// PLA Color Palette
const PLA_COLORS = [
  { name: 'Ivory', hex: '#f7dbc6' },
  { name: 'Apricot Skin', hex: '#f5b5a6' },
  { name: 'Cool White', hex: '#eceff4' },
  { name: 'Light Grey', hex: '#a2adb5' },
  { name: 'Dark Grey', hex: '#4c5459' },
  { name: 'Pitch Black', hex: '#41454a' },
  { name: 'Transparent', hex: '#ffffff', special: 'transparent' },
  { name: 'Simply Silver', hex: '#8d949b', special: 'metallic' },
  { name: 'Marble', hex: '#f0f0f0', special: 'marble' },
  { name: 'Chocolate Brown', hex: '#402c22' },
  { name: 'Rust Copper', hex: '#8d4931', special: 'metallic' },
  { name: 'Beige Brown', hex: '#986e52' },
  { name: 'Military Khaki', hex: '#967c5f' },
  { name: 'Army Green', hex: '#50533c' },
  { name: 'Nuclear Red', hex: '#bd0218' },
  { name: 'Imperial Red', hex: '#6e0b05' },
  { name: 'Outrageous Orange', hex: '#ff4c12' },
  { name: 'Bahama Yellow', hex: '#fce84c' }, 
  { name: 'Ryobix Green', hex: '#bdd94c' },
  { name: 'Grass Green', hex: '#61993b' },
  { name: 'Teal Blue', hex: '#58c5c5' },
  { name: 'Lagoon Blue', hex: '#037c80' },
  { name: 'Light Blue', hex: '#06589c' },
  { name: 'Royal Blue', hex: '#021e9c' },
  { name: 'Atomic Pink', hex: '#e797a2' },
  { name: 'Magenta', hex: '#c42d88' },
  { name: 'Lavender Violet', hex: '#747cb5' },
  { name: 'Thanos Purple', hex: '#655792' },
];

interface UploadedPart {
  id: string;
  file: File;
  url: string;
  name: string;
  extension: string;
  color: typeof PLA_COLORS[0];
  visible: boolean;
  geometry?: THREE.BufferGeometry; // Cache geometry
}

export const ThreeDPrinterViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [parts, setParts] = useState<UploadedPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');
  
  // Three.js instances refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const meshesRef = useRef<{ [key: string]: THREE.Group }>({});
  const animationFrameId = useRef<number>();

  // --- Helpers ---

  // Auto-fit camera to all visible objects
  const fitCameraToScene = useCallback(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return;

    const box = new THREE.Box3();
    let hasObjects = false;

    // Iterate over our managed parts
    Object.values(meshesRef.current).forEach(group => {
      box.expandByObject(group);
      hasObjects = true;
    });

    if (!hasObjects) {
        controls.target.set(0, 0, 0);
        camera.position.set(50, 50, 50);
        controls.update();
        return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    
    // Fit offset
    const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);

    const direction = camera.position.clone().sub(controls.target).normalize().multiplyScalar(distance);

    controls.maxDistance = distance * 10;
    controls.target.copy(center);
    
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();

    camera.position.copy(controls.target).add(direction);
    controls.update();
  }, []);

  // Initialize Three.js
  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f0f0f5');
    scene.fog = new THREE.Fog('#f0f0f5', 500, 4000); 
    sceneRef.current = scene;

    // --- Camera ---
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(50, 50, 50);
    cameraRef.current = camera;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.1;
    controls.maxDistance = 4000;
    controlsRef.current = controls;

    // --- Transform Controls ---
    const transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.addEventListener('dragging-changed', function (event) {
        controls.enabled = !event.value;
    });
    scene.add(transformControl);
    transformRef.current = transformControl;

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(100, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 4096;
    dirLight.shadow.mapSize.height = 4096;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 1000;
    dirLight.shadow.camera.left = -500;
    dirLight.shadow.camera.right = 500;
    dirLight.shadow.camera.top = 500;
    dirLight.shadow.camera.bottom = -500;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.radius = 2;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-50, 20, -50);
    scene.add(fillLight);

    // --- Ground Grid ---
    const gridHelper = new THREE.GridHelper(2000, 100, 0xcccccc, 0xe5e5e5);
    gridHelper.position.y = -0.02;
    scene.add(gridHelper);

    const planeGeometry = new THREE.PlaneGeometry(4000, 4000);
    const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.15, color: 0x000000 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.05;
    plane.receiveShadow = true;
    scene.add(plane);

    // --- Raycaster for Selection ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event: PointerEvent) => {
        // Only trigger on left click
        if (event.button !== 0) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // Intersect against all parts
        const objectsToCheck = Object.values(meshesRef.current);
        const intersects = raycaster.intersectObjects(objectsToCheck, true);

        if (intersects.length > 0) {
            // Find the root group that has the partId
            let current: THREE.Object3D | null = intersects[0].object;
            while (current) {
                if (current.userData.partId) {
                    setSelectedId(current.userData.partId);
                    return;
                }
                current = current.parent;
            }
        } else {
            // Clicked empty space
            setSelectedId(null);
        }
    };
    
    // Attach event to canvas
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // --- Animation Loop ---
    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // --- Resize Handler ---
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement) {
          renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      }
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      transformControl.dispose();
      renderer.dispose();
    };
  }, []);

  // Handle Selection Change (Attach/Detach Gizmo)
  useEffect(() => {
      if (!transformRef.current) return;
      
      if (selectedId && meshesRef.current[selectedId]) {
          transformRef.current.attach(meshesRef.current[selectedId]);
      } else {
          transformRef.current.detach();
      }
  }, [selectedId]);

  // Handle Mode Change
  useEffect(() => {
      if (transformRef.current) {
          transformRef.current.setMode(transformMode);
      }
  }, [transformMode]);

  // Sync React State with Three.js Scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // 1. Remove deleted parts
    const activeIds = new Set(parts.map(p => p.id));
    Object.keys(meshesRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        const group = meshesRef.current[id];
        // Detach gizmo if we are deleting the selected part
        if (transformRef.current?.object === group) {
            transformRef.current.detach();
            setSelectedId(null);
        }
        
        scene.remove(group);
        // Clean up memory
        group.traverse((child) => {
           if ((child as THREE.Mesh).isMesh) {
              const m = child as THREE.Mesh;
              m.geometry.dispose();
              if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
              else (m.material as THREE.Material).dispose();
           }
        });
        delete meshesRef.current[id];
      }
    });

    // 2. Add or Update parts
    parts.forEach(part => {
      // Create Material
      const materialParams: THREE.MeshPhysicalMaterialParameters = {
        color: part.color.hex,
        roughness: 0.5,
        metalness: 0.1,
      };

      if (part.color.special === 'metallic') {
        materialParams.metalness = 0.7;
        materialParams.roughness = 0.2;
      } else if (part.color.special === 'transparent') {
        materialParams.transparent = true;
        materialParams.opacity = 0.5;
        materialParams.transmission = 0.9;
        materialParams.thickness = 2.0;
        materialParams.roughness = 0.1;
      } else if (part.color.special === 'marble') {
        materialParams.roughness = 0.8;
      }

      const newMaterial = new THREE.MeshPhysicalMaterial(materialParams);

      if (!meshesRef.current[part.id]) {
        // Load new part
        loadPartGeometry(part, newMaterial).then(group => {
           if (!activeIds.has(part.id) || !scene) return; // Cancelled
           scene.add(group);
           meshesRef.current[part.id] = group;
           // Auto select newly added part
           setSelectedId(part.id);
           
           if (parts.length === 1) {
               fitCameraToScene(); 
           }
        });
      } else {
        // Update existing material
        const group = meshesRef.current[part.id];
        group.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const m = child as THREE.Mesh;
                if (!Array.isArray(m.material)) (m.material as THREE.Material).dispose();
                m.material = newMaterial;
            }
        });
      }
    });
  }, [parts, fitCameraToScene]);

  // Load Logic
  const loadPartGeometry = async (part: UploadedPart, material: THREE.Material): Promise<THREE.Group> => {
      return new Promise((resolve, reject) => {
          const ext = part.extension.toLowerCase();
          const group = new THREE.Group();
          group.userData.partId = part.id; // CRITICAL for selection

          // Common Setup for loaded mesh
          const setupMesh = (mesh: THREE.Mesh) => {
            mesh.material = material;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          };

          if (ext === 'stl') {
              new STLLoader().load(part.url, (geometry) => {
                  geometry.computeVertexNormals();
                  geometry.center(); 
                  
                  const mesh = new THREE.Mesh(geometry, material);
                  setupMesh(mesh);
                  mesh.rotation.x = -Math.PI / 2;
                  
                  mesh.updateMatrixWorld(); 
                  const box = new THREE.Box3().setFromObject(mesh);
                  const minY = box.min.y;
                  mesh.position.y -= minY;
                  
                  group.add(mesh);
                  resolve(group);
              }, undefined, reject);
          } 
          else if (ext === 'obj') {
              new OBJLoader().load(part.url, (objGroup) => {
                  objGroup.traverse((child) => {
                      if ((child as THREE.Mesh).isMesh) {
                          setupMesh(child as THREE.Mesh);
                      }
                  });

                  const box = new THREE.Box3().setFromObject(objGroup);
                  const center = box.getCenter(new THREE.Vector3());
                  
                  objGroup.position.x -= center.x;
                  objGroup.position.y -= center.y;
                  objGroup.position.z -= center.z;
                  
                  const box2 = new THREE.Box3().setFromObject(objGroup);
                  const minY = box2.min.y;
                  objGroup.position.y -= minY;
                  
                  group.add(objGroup);
                  resolve(group);
              }, undefined, reject);
          }
          else if (ext === 'gltf' || ext === 'glb') {
              new GLTFLoader().load(part.url, (gltf) => {
                   const model = gltf.scene;
                   model.traverse((child) => {
                      if ((child as THREE.Mesh).isMesh) {
                          setupMesh(child as THREE.Mesh);
                      }
                  });

                  const box = new THREE.Box3().setFromObject(model);
                  const center = box.getCenter(new THREE.Vector3());
                  
                  model.position.x -= center.x;
                  model.position.y -= center.y;
                  model.position.z -= center.z;

                  const box2 = new THREE.Box3().setFromObject(model);
                  const minY = box2.min.y;
                  model.position.y -= minY;

                  group.add(model);
                  resolve(group);
              }, undefined, reject);
          }
          else {
              reject(new Error(`Unsupported format: ${ext}`));
          }
      });
  };

  const processFiles = (fileList: FileList | null) => {
     if (!fileList) return;
     
     setLoading(true);
     setErrorMsg(null);

     const newParts: UploadedPart[] = [];
     const errors: string[] = [];

     Array.from(fileList).forEach(file => {
         const name = file.name;
         const extension = name.split('.').pop()?.toLowerCase() || '';
         
         if (['stl', 'obj', 'gltf', 'glb'].includes(extension)) {
             newParts.push({
                id: Math.random().toString(36).substr(2, 9),
                file,
                url: URL.createObjectURL(file),
                name: file.name,
                extension,
                color: PLA_COLORS[Math.floor(Math.random() * PLA_COLORS.length)],
                visible: true
             });
         } else {
             errors.push(name);
         }
     });

     if (errors.length > 0) {
         setErrorMsg(`Skipped unsupported files: ${errors.join(', ')}. Supported: .stl, .obj, .gltf, .glb`);
     }

     setParts(prev => [...prev, ...newParts]);
     setLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    e.target.value = ''; 
  };
  
  const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      processFiles(e.dataTransfer.files);
  };
  
  const onDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
  };

  const removePart = (id: string) => {
    setParts(prev => {
      const part = prev.find(p => p.id === id);
      if (part) URL.revokeObjectURL(part.url);
      return prev.filter(p => p.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  };

  const updatePartColor = (id: string, color: typeof PLA_COLORS[0]) => {
    setParts(prev => prev.map(p => p.id === id ? { ...p, color } : p));
  };

  return (
    <div className="flex flex-col h-screen bg-stone-50 text-stone-900 font-sans overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 bg-white border-b border-stone-200 flex items-center justify-between z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
            <Layers className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-stone-800">Print<span className="text-indigo-600">Viz</span> Studio</h1>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={fitCameraToScene} 
             className="flex items-center gap-2 px-3 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-sm font-medium transition-colors"
             title="Reset View"
           >
              <ZoomIn className="w-4 h-4" />
              <span className="hidden sm:inline">Reset View</span>
           </button>
           <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors shadow-sm text-sm font-medium">
             <Upload className="w-4 h-4" />
             <span>Upload Models</span>
             <input type="file" multiple accept=".stl,.obj,.gltf,.glb" className="hidden" onChange={handleFileUpload} />
           </label>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* 3D Viewport */}
        <div 
            className="flex-1 bg-[#f0f0f5] relative overflow-hidden group"
            onDrop={onDrop}
            onDragOver={onDragOver}
        >
          <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          
          {/* Messages / Overlays */}
          {errorMsg && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 text-red-600 px-4 py-3 rounded-lg shadow-lg border border-red-200 flex items-center gap-2 max-w-lg z-30 animate-in slide-in-from-top-4">
                  <Info className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{errorMsg}</span>
                  <button onClick={() => setErrorMsg(null)} className="ml-2 p-1 hover:bg-red-100 rounded">
                      <Trash2 className="w-3 h-3" />
                  </button>
              </div>
          )}

          {parts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center p-8 bg-white/80 backdrop-blur rounded-2xl border border-stone-200 shadow-xl max-w-md pointer-events-auto">
                <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-stone-800 mb-2">Drag & Drop Models</h3>
                <p className="text-stone-500 mb-6 text-sm">
                  Visualize your 3D prints in realistic materials.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-stone-400 font-mono text-left bg-stone-50 p-3 rounded-lg">
                   <div className="flex items-center gap-2"><FileType className="w-3 h-3"/> .STL</div>
                   <div className="flex items-center gap-2"><FileType className="w-3 h-3"/> .OBJ</div>
                   <div className="flex items-center gap-2"><FileType className="w-3 h-3"/> .GLTF</div>
                   <div className="flex items-center gap-2"><FileType className="w-3 h-3"/> .GLB</div>
                </div>
              </div>
            </div>
          )}
          
          {loading && (
             <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
                 <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                    <span className="font-semibold text-indigo-900">Loading Geometry...</span>
                 </div>
             </div>
          )}
          
          {selectedId && (
            <>
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur p-1.5 rounded-xl shadow-lg border border-stone-200 flex items-center gap-1 z-30">
                    <button
                        onClick={(e) => { e.stopPropagation(); setTransformMode('translate'); }}
                        className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${transformMode === 'translate' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-stone-100 text-stone-600'}`}
                    >
                        <Move className="w-4 h-4" />
                        <span>Move</span>
                    </button>
                    <div className="w-px h-4 bg-stone-300 mx-1" />
                    <button
                        onClick={(e) => { e.stopPropagation(); setTransformMode('rotate'); }}
                        className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${transformMode === 'rotate' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-stone-100 text-stone-600'}`}
                    >
                        <Rotate3D className="w-4 h-4" />
                        <span>Rotate</span>
                    </button>
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-stone-200 text-xs text-stone-600 flex items-center gap-2 pointer-events-none select-none">
                    <MousePointer2 className="w-3 h-3 text-indigo-600" />
                    <span>
                        {transformMode === 'translate' ? 'Drag arrows to move' : 'Drag circles to rotate'} • Click background to deselect
                    </span>
                </div>
            </>
          )}
        </div>

        {/* Controls Panel */}
        <div className="w-full md:w-[400px] bg-white border-l border-stone-200 flex flex-col overflow-hidden shadow-xl z-20">
          <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
            
            {parts.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-stone-400 space-y-4 opacity-50">
                  <BoxIcon className="w-12 h-12" />
                  <p>No parts loaded</p>
               </div>
            ) : (
              <div className="space-y-8 pb-10">
                {parts.map((part) => (
                  <div key={part.id} className={`animate-in fade-in slide-in-from-right-4 duration-300 transition-all ${selectedId === part.id ? 'bg-indigo-50/50 -mx-3 px-3 py-2 rounded-xl ring-1 ring-indigo-200' : ''}`}>
                    <div 
                        className="flex items-center justify-between mb-3 cursor-pointer"
                        onClick={() => setSelectedId(part.id)}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <BoxIcon className={`w-4 h-4 shrink-0 ${selectedId === part.id ? 'text-indigo-600' : 'text-stone-400'}`} />
                        <div className="flex flex-col overflow-hidden">
                            <h3 className={`text-sm font-bold truncate leading-tight ${selectedId === part.id ? 'text-indigo-900' : 'text-stone-800'}`} title={part.name}>
                            {part.name}
                            </h3>
                            <span className="text-[10px] text-stone-400 font-mono uppercase">{part.extension}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded">{part.color.name}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removePart(part.id); }}
                          className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-500 rounded-md transition-colors"
                          title="Remove part"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-5 gap-1.5 p-2 bg-stone-50 rounded-xl border border-stone-100">
                      {PLA_COLORS.map((color) => (
                        <button
                          key={`${part.id}-${color.name}`}
                          onClick={(e) => { e.stopPropagation(); setSelectedId(part.id); updatePartColor(part.id, color); }}
                          className={`group relative aspect-square rounded-md overflow-hidden ring-1 transition-all ${
                            part.color.name === color.name 
                              ? 'ring-2 ring-indigo-600 ring-offset-1 scale-105 z-10 shadow-sm' 
                              : 'ring-black/5 hover:ring-indigo-300 hover:scale-105'
                          }`}
                          title={color.name}
                        >
                          <div 
                            className="absolute inset-0" 
                            style={{ backgroundColor: color.hex }} 
                          />
                          {color.special === 'marble' && (
                            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(0,0,0,0.3)_1px,transparent_1px)] bg-[size:10px_10px]" />
                          )}
                          {color.special === 'transparent' && (
                             <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(0,0,0,0.1)_25%,transparent_25%,transparent_75%,rgba(0,0,0,0.1)_75%,rgba(0,0,0,0.1)),linear-gradient(45deg,rgba(0,0,0,0.1)_25%,transparent_25%,transparent_75%,rgba(0,0,0,0.1)_75%,rgba(0,0,0,0.1))] bg-[size:10px_10px] bg-[position:0_0,5px_5px]" />
                          )}
                          
                          {part.color.name === color.name && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <Check className="w-3 h-3 text-white drop-shadow-md" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-4 bg-stone-50 border-t border-stone-200">
             <div className="flex items-start gap-3">
               <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
               <div className="text-xs text-stone-500 leading-relaxed space-y-1">
                 <p><strong>Tip:</strong> Click a part to select it.</p>
                 <p>Use arrows to move parts along axes.</p>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
