// Cheap 3D feedback: tracer lines for every shot, impact sparks where a round
// stops, and a blast sphere with light for the grenade. Everything fades on its
// own and is removed; nothing allocates in the hot loop beyond the small lists
// below. The red damage vignette lives in the DOM HUD, not here.
import * as THREE from 'three';

export function createEffects(scene) {
  const tracers = [];
  const sparks = [];
  const blasts = [];
  const tracerMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color('#ffd9a0'),
    transparent: true,
    opacity: 0.85,
  });
  const sparkGeometry = new THREE.SphereGeometry(0.03, 6, 4);
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a1a') });

  function tracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    scene.add(line);
    tracers.push({ line, left: 0.09 });
  }

  function spark(point, count = 6) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial);
      mesh.position.copy(point);
      scene.add(mesh);
      sparks.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4),
        left: 0.25 + Math.random() * 0.15,
      });
    }
  }

  function blast(point) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a1a'), transparent: true, opacity: 0.9 }),
    );
    mesh.position.copy(point);
    scene.add(mesh);
    const light = new THREE.PointLight(new THREE.Color('#ff7a1a'), 60, 18);
    light.position.copy(point);
    scene.add(light);
    blasts.push({ mesh, light, left: 0.45, age: 0 });
  }

  function step(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.left -= dt;
      t.line.material.opacity = Math.max(0, t.left / 0.09) * 0.85;
      if (t.left <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      s.left -= dt;
      s.velocity.y -= 9 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      if (s.left <= 0) {
        scene.remove(s.mesh);
        sparks.splice(i, 1);
      }
    }
    for (let i = blasts.length - 1; i >= 0; i -= 1) {
      const b = blasts[i];
      b.left -= dt;
      b.age += dt;
      const scale = 1 + b.age * 26;
      b.mesh.scale.setScalar(scale);
      b.mesh.material.opacity = Math.max(0, b.left / 0.45) * 0.9;
      b.light.intensity = Math.max(0, b.left / 0.45) * 60;
      if (b.left <= 0) {
        scene.remove(b.mesh);
        scene.remove(b.light);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        blasts.splice(i, 1);
      }
    }
  }

  return { tracer, spark, blast, step };
}
