import { expect, test } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.setTimeout(90_000);

test("Riyaad's skinned model deforms, blends to rest, changes shirt and resets safely after driving", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/3d.html");
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 60_000 });
  await page.locator("#preview-start-button").click();
  const checks = await page.evaluate(() => {
    const p = (window as any).__preview;
    // Stop only this test's render loop for reproducible pose samples; production
    // input, pause and collision behaviour is exercised by the existing suites.
    p.engine.stopRenderLoop();
    const rig = p.player.rig, mesh = rig.mesh;
    const weights = Array.from(mesh.getVerticesData("matricesWeights")) as number[];
    let weightsValid = true;
    for (let i = 0; i < weights.length; i += 4) {
      if (Math.abs(weights[i] + weights[i + 1] + weights[i + 2] + weights[i + 3] - 1) > 0.00001) weightsValid = false;
    }
    const matrix = () => { rig.skeleton.prepare(true); return Array.from(rig.skeleton.getTransformMatrices(mesh)); };
    const angle = (name: string) => rig.bones[name].getRotation().x;
    rig.reset();
    const idle = matrix();
    for (let i = 0; i < 15; i++) rig.update(1 / 60, 4 / 60, false);
    const walk = matrix(), walkMode = rig.motion;
    for (let i = 0; i < 15; i++) rig.update(1 / 60, 7 / 60, true);
    const sprint = matrix(), sprintMode = rig.motion;
    const knee = Math.max(Math.abs(angle("kneeL")), Math.abs(angle("kneeR")));
    const elbow = Math.max(Math.abs(angle("elbowL")), Math.abs(angle("elbowR")));
    for (let i = 0; i < 90; i++) rig.update(1 / 60, 0, false);
    const stopped = { mode: rig.motion, knee: angle("kneeL"), elbow: angle("elbowL") };
    const colours = Array.from(mesh.getVerticesData("color")) as number[];
    p.player.setCrewColour("#20a09c");
    const recoloured = Array.from(mesh.getVerticesData("color")) as number[];
    const shirtChanged = colours.some((value, i) => value !== recoloured[i]);
    const skinIndex = colours.findIndex((_value, i) => i % 4 === 0 && colours[i] > 0.5 && colours[i + 1] < 0.5);
    const skinUnchanged = skinIndex >= 0 && colours.slice(skinIndex, skinIndex + 4).every((value, i) => value === recoloured[skinIndex + i]);
    rig.seat();
    const seated = { mode: rig.motion, hip: angle("hipL"), knee: angle("kneeL"), matrix: matrix() };
    p.player.leaveVehicle(p.player.position);
    const exited = { mode: rig.motion, hip: angle("hipL"), knee: angle("kneeL") };
    rig.update(0.05, 0, false, "talk");
    const talking = { mode: rig.motion, elbow: angle("elbowR") };
    const before = matrix(); rig.update(0, 0, false); const after = matrix();
    p.player.setCrewColour(null); rig.reset();
    return { weightsValid, bones: rig.skeleton.bones.length, meshes: p.player.shadowCasters.length,
      vertices: mesh.getTotalVertices(), triangles: mesh.getTotalIndices() / 3,
      deformsWalking: JSON.stringify(idle) !== JSON.stringify(walk),
      deformsRunning: JSON.stringify(walk) !== JSON.stringify(sprint),
      finiteMatrices: [...idle, ...walk, ...sprint, ...seated.matrix].every(Number.isFinite),
      walkMode, sprintMode, knee, elbow, stopped, shirtChanged, skinUnchanged, seated, exited, talking,
      zeroTimeFrozen: JSON.stringify(before) === JSON.stringify(after) };
  });
  expect(checks.weightsValid).toBe(true);
  expect(checks.bones).toBe(15);
  expect(checks.meshes).toBe(1);
  expect(checks.vertices).toBeGreaterThan(500);
  expect(checks.triangles).toBeLessThan(2500);
  expect(checks.deformsWalking && checks.deformsRunning && checks.finiteMatrices).toBe(true);
  expect(checks.walkMode).toBe("walk"); expect(checks.sprintMode).toBe("sprint");
  expect(checks.knee).toBeGreaterThan(0.15); expect(checks.elbow).toBeGreaterThan(0.5);
  expect(checks.stopped.mode).toBe("idle");
  expect(Math.abs(checks.stopped.knee)).toBeLessThan(0.05);
  expect(Math.abs(checks.stopped.elbow + 0.12)).toBeLessThan(0.01);
  expect(checks.shirtChanged && checks.skinUnchanged).toBe(true);
  expect(checks.seated.mode).toBe("seated");
  expect(checks.seated.hip).toBeCloseTo(-1.32, 2); expect(checks.seated.knee).toBeCloseTo(1.45, 2);
  expect(checks.exited.mode).toBe("idle"); expect(checks.exited.hip).toBeCloseTo(0, 5);
  expect(checks.exited.knee).toBeCloseTo(0, 5);
  expect(checks.talking.mode).toBe("talk"); expect(checks.talking.elbow).toBeLessThan(-0.4);
  expect(checks.zeroTimeFrozen).toBe(true);
  for (const mode of ["idle", "walk", "sprint", "seated"] as const) {
    await page.evaluate((mode) => {
      const p = (window as any).__preview;
      p.player.rig.reset();
      if (mode === "seated") p.player.rig.seat();
      else if (mode !== "idle") for (let i = 0; i < 24; i++) p.player.rig.update(1 / 60, (mode === "walk" ? 4 : 7) / 60, mode === "sprint");
      p.camera.alpha = Math.PI * 0.28; p.camera.beta = 1.38; p.camera.radius = 3.4;
      p.scene.render();
    }, mode);
    await page.locator("#preview-canvas").screenshot({ path: testInfo.outputPath(`riyaad-${mode}.png`) });
  }
  expect(errors).toEqual([]);
});
