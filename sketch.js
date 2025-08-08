const LEVEL_COUNTS = [81, 41, 21, 11, 5, 1]; // bottom -> top
const RESPONSIBILITY = [0.3, 0.5, 0.6, 0.7, 0.85, 1.0];
const DISMISS_THRESHOLD = 4; // competence < 4 -> dismissal
const RETIRE_AGE = 60; // age  > 60 -> retirement

let strategySelect, transSelect, runChk, stepBtn, resetBtn, speedSlider;

// Simulation state
let agents = [];
let timeStep = 0;
let running = false;
let simAccumulator = 0; // collects fractional steps per frame

function setup() {
  createCanvas(windowWidth, windowHeight);
  initUI();
  createOrg();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// UI initialization
function initUI() {
  const ui = select("#ui");
  ui.html("");

  createSpan("Strategy: ").parent(ui);
  strategySelect = createSelect().parent(ui);
  ["Best", "Worst", "Random"].forEach((s) => strategySelect.option(s));
  strategySelect.value("Best");

  createSpan("  Transmission: ").parent(ui);
  transSelect = createSelect().parent(ui);
  ["Common Sense", "Peter Hypothesis"].forEach((t) => transSelect.option(t));
  transSelect.value("Common Sense");

  createElement("br").parent(ui);
  runChk = createCheckbox("Run", false).parent(ui);
  runChk.changed(() => (running = runChk.checked()));

  createSpan("  ").parent(ui);
  stepBtn = createButton("Step").parent(ui);
  stepBtn.mousePressed(stepSimulation);

  createSpan("  ").parent(ui);
  resetBtn = createButton("Reset").parent(ui);
  resetBtn.mousePressed(resetSimulation);

  // Speed slider: 0.1x – 10x (step 0.1)
  createElement("br").parent(ui);
  createSpan("Speed (x): ").parent(ui);
  speedSlider = createSlider(0.1, 10, 1, 0.1).parent(ui);
  speedSlider.style("width", "120px");
}

function resetSimulation() {
  timeStep = 0;
  createOrg();
  simAccumulator = 0;
}

// Utility: find first vacant slot in a level
function getVacantSlot(level) {
  for (let i = 0; i < LEVEL_COUNTS[level]; i++) {
    const occupied = agents.some(
      (a) => a.alive && a.level === level && a.slot === i
    );
    if (!occupied) return i;
  }
  return null; // should not happen because we always keep it filled
}

// Build initial organisation
function createOrg() {
  agents = [];
  let id = 0;
  for (let lvl = 0; lvl < LEVEL_COUNTS.length; lvl++) {
    for (let i = 0; i < LEVEL_COUNTS[lvl]; i++) {
      agents.push(new Agent(id++, lvl, i));
    }
  }
}

class Agent {
  constructor(id, level, slot) {
    this.id = id;
    this.level = level; // 0 = bottom tier
    this.slot = slot; // fixed horizontal position within the level
    this.age = int(random(18, 60));
    this.competence = constrain(randomGaussian(7, 2), 1, 10);
    this.alive = true;

    // initial screen position
    const { x, y } = this.targetPos();
    this.x = x;
    this.y = y;
  }

  // Color: yellow (low) -> red (high) competence
  get col() {
    const yellow = color(255, 255, 0);
    const red = color(255, 0, 0);
    const t = map(this.competence, 1, 10, 0, 1);
    return lerpColor(yellow, red, t);
  }

  // Target position based on current level & slot
  targetPos() {
    const yStep = height / (LEVEL_COUNTS.length + 1);
    const targetY = height - yStep * (this.level + 1);
    const xStep = width / (LEVEL_COUNTS[this.level] + 1);
    const targetX = xStep * (this.slot + 1);
    return { x: targetX, y: targetY };
  }

  // Smoothly interpolate toward target position
  update() {
    const { x: tx, y: ty } = this.targetPos();
    this.x = lerp(this.x, tx, 0.15);
    this.y = lerp(this.y, ty, 0.15);
  }

  draw() {
    this.update();

    push();
    translate(this.x, this.y);
    fill(this.col);
    noStroke();
    ellipse(0, -6, 10, 10); // head
    rectMode(CENTER);
    rect(0, 8, 8, 20, 2); // body
    pop();
  }
}

// Main draw loop
function draw() {
  background(240);

  if (running) {
    const factor = parseFloat(speedSlider.value()); // 0.1 – 10
    simAccumulator += factor; // accumulate fractional steps
    while (simAccumulator >= 1) {
      stepSimulation();
      simAccumulator -= 1;
    }
  }

  // Draw agents level by level, ordered by slot
  for (let lvl = 0; lvl < LEVEL_COUNTS.length; lvl++) {
    agents
      .filter((a) => a.alive && a.level === lvl)
      .sort((a, b) => a.slot - b.slot)
      .forEach((a) => a.draw());
  }

  drawHUD();
}

// Advance one simulation step
function stepSimulation() {
  timeStep++;

  // Age increment and retire/dismiss
  agents.forEach((a) => {
    if (!a.alive) return;
    a.age++;
    if (a.competence < DISMISS_THRESHOLD || a.age > RETIRE_AGE) a.alive = false;
  });

  // Promotion: start from second‑top level downwards
  for (let lvl = LEVEL_COUNTS.length - 2; lvl >= 0; lvl--) {
    const need = LEVEL_COUNTS[lvl + 1];
    let upperAlive = agents.filter((a) => a.alive && a.level === lvl + 1);

    while (upperAlive.length < need) {
      const candidates = agents.filter((a) => a.alive && a.level === lvl);
      if (candidates.length === 0) break;

      // Select candidate according to chosen strategy
      let chosen;
      switch (strategySelect.value()) {
        case "Best":
          chosen = candidates.sort((b, a) => a.competence - b.competence)[0];
          break;
        case "Worst":
          chosen = candidates.sort((a, b) => a.competence - b.competence)[0];
          break;
        default: // Random
          chosen = random(candidates);
      }

      // Snap animation starting point to current slot position
      const { x, y } = chosen.targetPos();
      chosen.x = x;
      chosen.y = y;

      // Competence transmission
      if (transSelect.value() === "Common Sense") {
        chosen.competence = constrain(chosen.competence + random(-1, 1), 1, 10);
      } else {
        // Peter Hypothesis
        chosen.competence = constrain(randomGaussian(7, 2), 1, 10);
      }

      // Promote to next level and assign first vacant slot
      const vacant = getVacantSlot(lvl + 1);
      if (vacant === null) break; // should not happen
      chosen.level = lvl + 1;
      chosen.slot = vacant;
      upperAlive.push(chosen);
    }
  }

  // Hire new agents for the bottom level while vacant slots exist
  while (true) {
    const vacant = getVacantSlot(0);
    if (vacant === null) break;
    agents.push(new Agent(agents.length, 0, vacant));
  }
}

// HUD & efficiency
function drawHUD() {
  const eff = calcEfficiency();
  fill(0);
  noStroke();
  textSize(14);
  text(`Step: ${timeStep}`, 10, height - 42);
  text(`Efficiency: ${nf(eff, 0, 2)}%`, 10, height - 24);
  text(`Speed: ${speedSlider.value()}×`, 10, height - 6);
}

function calcEfficiency() {
  let total = 0;
  let max = 0;
  for (let lvl = 0; lvl < LEVEL_COUNTS.length; lvl++) {
    const aliveLvlAgents = agents.filter((a) => a.alive && a.level === lvl);
    const sumComp = aliveLvlAgents.reduce((s, a) => s + a.competence, 0);
    total += sumComp * RESPONSIBILITY[lvl];
    max += LEVEL_COUNTS[lvl] * 10 * RESPONSIBILITY[lvl];
  }
  return (total / max) * 100;
}
