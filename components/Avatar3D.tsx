import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

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

const VISEMES = {
    sil: { mouthOpen: 0.05, mouthWidth: 0.8, lipPucker: 0, tongueY: -0.1 },
    aa:  { mouthOpen: 0.8,  mouthWidth: 0.9, lipPucker: 0, tongueY: 0 },
    ee:  { mouthOpen: 0.2,  mouthWidth: 1.2, lipPucker: 0, tongueY: -0.05 },
    ih:  { mouthOpen: 0.15, mouthWidth: 1.1, lipPucker: 0, tongueY: -0.05 },
    oh:  { mouthOpen: 0.6,  mouthWidth: 0.6, lipPucker: 0.8, tongueY: -0.05 },
    ou:  { mouthOpen: 0.3,  mouthWidth: 0.4, lipPucker: 1.2, tongueY: -0.05 },
};

const Eye = ({ side, mouse }: { side: 'left' | 'right', mouse: React.MutableRefObject<THREE.Vector2> }) => {
    const group = useRef<THREE.Group>(null);
    const pupil = useRef<THREE.Group>(null);
    const [blinking, setBlinking] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        const blinkLoop = () => {
            const nextBlink = Math.random() * 3000 + 2000;
            timer = setTimeout(() => {
                setBlinking(true);
                setTimeout(() => {
                    setBlinking(false);
                    blinkLoop();
                }, 120);
            }, nextBlink);
        };
        blinkLoop();
        return () => clearTimeout(timer);
    }, []);

    useFrame(() => {
        if (group.current && pupil.current) {
            // Blink animation: scale Y to 0.05
            const targetScale = blinking ? 0.05 : 1;
            group.current.scale.y = THREE.MathUtils.lerp(group.current.scale.y, targetScale, 0.4);
            
            // Eye Tracking (Subtle)
            const targetX = mouse.current.x * 0.12;
            const targetY = mouse.current.y * 0.12;
            
            pupil.current.position.x = THREE.MathUtils.lerp(pupil.current.position.x, targetX, 0.15);
            pupil.current.position.y = THREE.MathUtils.lerp(pupil.current.position.y, targetY, 0.15);
        }
    });

    return (
        <group ref={group} position={[side === 'left' ? -0.35 : 0.35, 0.15, 0.85]}>
            {/* White */}
            <Sphere args={[0.18, 32, 32]} scale={[1, 1.2, 0.6]} material={eyeWhiteMaterial} />
            {/* Pupil */}
            <group ref={pupil} position={[0, 0, 0.15]}>
                <Sphere args={[0.09, 32, 32]} material={eyeBlackMaterial} scale={[1, 1, 0.5]} />
                {/* Glint */}
                <Sphere args={[0.03, 16, 16]} position={[0.03, 0.03, 0.06]} material={eyeWhiteMaterial} />
            </group>
        </group>
    );
};

const Eyebrow = ({ side }: { side: 'left' | 'right' }) => {
    const ref = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (ref.current) {
            const t = state.clock.elapsedTime;
            ref.current.position.y = 0.45 + Math.sin(t * 2) * 0.01;
            ref.current.rotation.z = (side === 'left' ? 0.1 : -0.1) + Math.sin(t * 1.5) * 0.02;
        }
    });
    return (
        <mesh ref={ref} position={[side === 'left' ? -0.35 : 0.35, 0.45, 0.88]}>
            <boxGeometry args={[0.25, 0.04, 0.05]} />
            <meshStandardMaterial color="#3B2F2F" />
        </mesh>
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
    const mouthGroupRef = useRef<THREE.Group>(null);
    const mouthInnerRef = useRef<THREE.Mesh>(null);
    const tongueRef = useRef<THREE.Mesh>(null);
    const headGroup = useRef<THREE.Group>(null);
    const { size } = useThree();
    const mouse = useRef(new THREE.Vector2());
    const [currentViseme, setCurrentViseme] = useState(VISEMES.sil);
    const lastVolume = useRef(0);

    // Update mouse position normalized (-1 to 1)
    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            mouse.current.x = (event.clientX / size.width) * 2 - 1;
            mouse.current.y = -(event.clientY / size.height) * 2 + 1;
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [size]);

    // Viseme logic: Cycle through visemes when volume is high
    useEffect(() => {
        if (volume > 0.05) {
            const visemeKeys = Object.keys(VISEMES).filter(k => k !== 'sil');
            const interval = setInterval(() => {
                const randomKey = visemeKeys[Math.floor(Math.random() * visemeKeys.length)];
                setCurrentViseme(VISEMES[randomKey as keyof typeof VISEMES]);
            }, 120); // Faster cycle for more natural speech look
            return () => clearInterval(interval);
        } else {
            setCurrentViseme(VISEMES.sil);
        }
    }, [volume > 0.05]);

    useFrame((state) => {
        const t = state.clock.elapsedTime;

        // Mouth Lip Sync with Visemes
        if (mouthGroupRef.current && mouthInnerRef.current && tongueRef.current) {
            // Base openness from volume
            const volumeBoost = Math.max(0, volume * 1.2);
            
            // Interpolate towards viseme targets
            const targetOpen = currentViseme.mouthOpen * (0.5 + volumeBoost);
            const targetWidth = currentViseme.mouthWidth;
            const targetPucker = currentViseme.lipPucker;
            const targetTongueY = currentViseme.tongueY;

            // Apply to mouth group (overall size/shape)
            mouthGroupRef.current.scale.y = THREE.MathUtils.lerp(mouthGroupRef.current.scale.y, targetOpen + 0.05, 0.25);
            mouthGroupRef.current.scale.x = THREE.MathUtils.lerp(mouthGroupRef.current.scale.x, targetWidth, 0.25);
            
            // Pucker effect (move mouth forward slightly)
            mouthGroupRef.current.position.z = THREE.MathUtils.lerp(mouthGroupRef.current.position.z, 0.9 + targetPucker * 0.05, 0.2);
            
            // Tongue movement
            tongueRef.current.position.y = THREE.MathUtils.lerp(tongueRef.current.position.y, targetTongueY, 0.2);
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
                 headGroup.current.rotation.x += Math.sin(t * 15) * volume * 0.03;
            }
        }
        lastVolume.current = volume;
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
            <Eyebrow side="left" />
            <Eyebrow side="right" />

            {/* Nose (Simple Button) */}
            <Sphere args={[0.08, 16, 16]} position={[0, -0.05, 0.95]} material={skinMaterial}>
                 <meshStandardMaterial color="#FFC4A8" roughness={0.6} /> 
            </Sphere>

            {/* Cheeks (Blush) */}
            <Sphere args={[0.18, 16, 16]} position={[-0.6, -0.15, 0.75]} material={blushMaterial} scale={[1, 0.6, 1]} />
            <Sphere args={[0.18, 16, 16]} position={[0.6, -0.15, 0.75]} material={blushMaterial} scale={[1, 0.6, 1]} />

            {/* Enhanced Mouth with Visemes */}
            <group position={[0, -0.4, 0.9]} ref={mouthGroupRef}>
                {/* Mouth Inner (Dark) */}
                <mesh ref={mouthInnerRef}>
                    <sphereGeometry args={[0.2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshBasicMaterial color="#3E1C1C" side={THREE.DoubleSide} />
                </mesh>
                
                {/* Tongue */}
                <mesh ref={tongueRef} position={[0, -0.1, 0.05]} scale={[0.7, 0.4, 0.5]}>
                    <sphereGeometry args={[0.15]} />
                    <meshBasicMaterial color="#FF6B6B" />
                </mesh>

                {/* Lips (Upper & Lower) */}
                <mesh position={[0, 0.1, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.18, 0.02, 8, 24, Math.PI]} />
                    <meshStandardMaterial color="#FF8A8A" />
                </mesh>
                <mesh position={[0, -0.1, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.18, 0.02, 8, 24, Math.PI]} />
                    <meshStandardMaterial color="#FF8A8A" />
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
        <group position={[0, 3.0, 0]} scale={0.9}>
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