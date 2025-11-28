import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Add type support for R3F intrinsic elements
// Augment both global JSX and React.JSX to ensure types are picked up correctly
interface ThreeCustomElements {
  group: any;
  mesh: any;
  cylinderGeometry: any;
  planeGeometry: any;
  sphereGeometry: any;
  meshStandardMaterial: any;
  meshBasicMaterial: any;
  ambientLight: any;
  directionalLight: any;
  spotLight: any;
  color: any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeCustomElements {}
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeCustomElements {}
  }
}

interface Avatar3DProps {
  volume: number; // 0 to 1
}

// --- Toon/Toy Materials ---

const skinMaterial = new THREE.MeshStandardMaterial({
  color: '#FFDFC4', // Fair skin tone
  roughness: 0.7,   // Matte look
  metalness: 0.0,
});

const hairMaterial = new THREE.MeshStandardMaterial({
  color: '#3B2F2F', // Dark Brown
  roughness: 0.8,
  metalness: 0.0,
});

const eyeWhiteMaterial = new THREE.MeshStandardMaterial({ color: '#FFFFFF' });
const eyeBlackMaterial = new THREE.MeshStandardMaterial({ color: '#111111' });
const blushMaterial = new THREE.MeshStandardMaterial({ color: '#FFB7B2', transparent: true, opacity: 0.6 });

// --- Parts ---

const Eye = ({ side, mouse }: { side: 'left' | 'right', mouse: React.MutableRefObject<THREE.Vector2> }) => {
    const group = useRef<THREE.Group>(null);
    const pupil = useRef<THREE.Group>(null);
    const [blinking, setBlinking] = useState(false);

    useEffect(() => {
        const blinkLoop = () => {
            const nextBlink = Math.random() * 3000 + 2000;
            setTimeout(() => {
                setBlinking(true);
                setTimeout(() => {
                    setBlinking(false);
                    blinkLoop();
                }, 150);
            }, nextBlink);
        };
        blinkLoop();
    }, []);

    useFrame(() => {
        if (group.current && pupil.current) {
            // Blink animation: scale Y to 0.1
            const targetScale = blinking ? 0.1 : 1;
            group.current.scale.y = THREE.MathUtils.lerp(group.current.scale.y, targetScale, 0.4);
            
            // Eye Tracking (Subtle)
            const targetX = mouse.current.x * 0.1;
            const targetY = mouse.current.y * 0.1;
            
            pupil.current.position.x = THREE.MathUtils.lerp(pupil.current.position.x, targetX, 0.2);
            pupil.current.position.y = THREE.MathUtils.lerp(pupil.current.position.y, targetY, 0.2);
        }
    });

    return (
        <group ref={group} position={[side === 'left' ? -0.35 : 0.35, 0.1, 0.85]}>
            {/* White */}
            <Sphere args={[0.18, 32, 32]} scale={[1, 1.2, 0.6]} material={eyeWhiteMaterial} />
            {/* Pupil */}
            <group ref={pupil} position={[0, 0, 0.15]}>
                <Sphere args={[0.08, 32, 32]} material={eyeBlackMaterial} scale={[1, 1, 0.5]} />
                {/* Glint */}
                <Sphere args={[0.03, 16, 16]} position={[0.03, 0.03, 0.06]} material={eyeWhiteMaterial} />
            </group>
        </group>
    );
};

const Hair = () => {
    return (
        <group>
            {/* Main Hair Cap */}
            <Sphere args={[1.02, 32, 32]} position={[0, 0.1, -0.05]} material={hairMaterial} />
            
            {/* Bangs / Front Hair Details */}
            <group position={[0, 0.8, 0.85]} rotation={[0.2, 0, 0]}>
                {/* Center Bang */}
                <mesh material={hairMaterial} rotation={[0, 0, -0.2]} position={[-0.2, 0, 0]}>
                    <cylinderGeometry args={[0.15, 0.15, 0.6, 8]} />
                </mesh>
                <mesh material={hairMaterial} rotation={[0, 0, 0.1]} position={[0.1, -0.05, 0]}>
                    <cylinderGeometry args={[0.18, 0.18, 0.7, 8]} />
                </mesh>
                <mesh material={hairMaterial} rotation={[0, 0, 0.4]} position={[0.4, 0.05, 0]}>
                    <cylinderGeometry args={[0.15, 0.15, 0.6, 8]} />
                </mesh>
            </group>
            
            {/* Side burns */}
            <mesh material={hairMaterial} position={[-0.9, -0.2, 0.2]} rotation={[0, 0, 0.1]}>
                <cylinderGeometry args={[0.12, 0.12, 0.8, 8]} />
            </mesh>
            <mesh material={hairMaterial} position={[0.9, -0.2, 0.2]} rotation={[0, 0, -0.1]}>
                <cylinderGeometry args={[0.12, 0.12, 0.8, 8]} />
            </mesh>
            
            {/* Back bun / Ponytail (Optional visual balance) */}
            <Sphere args={[0.4, 32, 32]} position={[0, 0.2, -1]} material={hairMaterial} />
        </group>
    );
};

const CartoonHead = ({ volume }: { volume: number }) => {
    const mouthRef = useRef<THREE.Group>(null);
    const headGroup = useRef<THREE.Group>(null);
    const { size } = useThree();
    const mouse = useRef(new THREE.Vector2());

    // Update mouse position normalized (-1 to 1)
    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            mouse.current.x = (event.clientX / size.width) * 2 - 1;
            mouse.current.y = -(event.clientY / size.height) * 2 + 1;
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [size]);

    useFrame((state) => {
        const t = state.clock.elapsedTime;

        // Mouth Lip Sync
        if (mouthRef.current) {
            // Map volume to mouth opening height
            const targetY = 0.1 + (volume * 1.5); // 0.1 (closed) to ~1.6 (open)
            const targetX = 1.0 - (volume * 0.3); // Narrow slightly when opening wide
            
            mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, targetY, 0.3);
            mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, targetX, 0.3);
        }

        // Head Tracking & Idle Animation
        if (headGroup.current) {
            // Idle Sway
            const idleX = Math.sin(t * 0.5) * 0.05;
            const idleY = Math.cos(t * 0.3) * 0.03;

            // Mouse Look (damped)
            const lookX = mouse.current.x * 0.3;
            const lookY = mouse.current.y * 0.2;

            // Combine
            headGroup.current.rotation.y = THREE.MathUtils.lerp(headGroup.current.rotation.y, idleX + lookX, 0.1);
            headGroup.current.rotation.x = THREE.MathUtils.lerp(headGroup.current.rotation.x, idleY + lookY, 0.1);
            
            // Subtle "Speaking" Nod
            if (volume > 0.1) {
                 headGroup.current.rotation.x += Math.sin(t * 20) * volume * 0.05;
            }
        }
    });

    return (
        <group ref={headGroup}>
            {/* Head Base */}
            <Sphere args={[1, 32, 32]} material={skinMaterial} />

            {/* Hair */}
            <Hair />

            {/* Face Features */}
            <Eye side="left" mouse={mouse} />
            <Eye side="right" mouse={mouse} />

            {/* Nose (Simple Button) */}
            <Sphere args={[0.08, 16, 16]} position={[0, -0.1, 0.95]} material={skinMaterial}>
                 <meshStandardMaterial color="#FFC4A8" roughness={0.6} /> 
            </Sphere>

            {/* Cheeks (Blush) */}
            <Sphere args={[0.18, 16, 16]} position={[-0.6, -0.15, 0.75]} material={blushMaterial} scale={[1, 0.6, 1]} />
            <Sphere args={[0.18, 16, 16]} position={[0.6, -0.15, 0.75]} material={blushMaterial} scale={[1, 0.6, 1]} />

            {/* Mouth */}
            <group position={[0, -0.35, 0.9]} ref={mouthRef}>
                {/* Background (Inside mouth) */}
                <mesh position={[0, 0, -0.02]} rotation={[0, 0, 0]}>
                     <planeGeometry args={[0.2, 0.1]} />
                     <meshBasicMaterial color="#3E1C1C" />
                </mesh>
                {/* Tongue (Optional detail) */}
                <mesh position={[0, -0.05, 0.02]} scale={[0.8, 0.5, 0.5]}>
                    <sphereGeometry args={[0.1]} />
                    <meshBasicMaterial color="#FF6B6B" />
                </mesh>
            </group>

            {/* Ears */}
            <Sphere args={[0.2, 16, 16]} position={[-0.95, 0, 0]} scale={[0.5, 1, 1]} material={skinMaterial} />
            <Sphere args={[0.2, 16, 16]} position={[0.95, 0, 0]} scale={[0.5, 1, 1]} material={skinMaterial} />
            
        </group>
    );
};

const Avatar3D: React.FC<Avatar3DProps> = ({ volume }) => {
  return (
    <div className="w-full h-full">
      {/* 
        Changes for Linux Chromium Black Screen Fix:
        1. Removed <Environment /> preset which requires external network loads that can fail/block rendering.
        2. Set dpr={1} to prevent scaling issues on some Linux display servers.
        3. Added fallback ambient lights to ensure visibility without Environment.
        4. gl={{ alpha: false }} for more stable context.
      */}
      <Canvas
        camera={{ position: [0, 0.5, 4.5], fov: 50 }}
        dpr={1}
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={['#252525']} />
        
        {/* Stronger Standard Lights to replace Environment */}
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        <directionalLight position={[-5, 5, 2]} intensity={0.8} />
        <spotLight position={[0, 5, 2]} angle={0.5} penumbra={1} intensity={1.0} />

        {/* Position moved up and slightly scaled down to keep the face above subtitle overlay on Linux browsers */}
        <group position={[0, 1.6, 0]} scale={0.9}>
             <CartoonHead volume={volume} />
        </group>

        <OrbitControls
             enableZoom={false}
             enablePan={false}
             minPolarAngle={Math.PI / 2 - 0.2}
             maxPolarAngle={Math.PI / 2 + 0.2}
             target={[0, 1.6, 0]}
        />
      </Canvas>
    </div>
  );
};

export default Avatar3D;