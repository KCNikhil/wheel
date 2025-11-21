// --- ERROR HANDLING ---
function showError(title, details) {
	const loadingDiv = document.getElementById("loading");
	const spinner = document.querySelector(".spinner");
	const text = document.getElementById("status-text");
	const subtext = document.querySelector(".subtext");

	if (spinner) spinner.style.display = "none";
	if (text) {
		text.innerText = title;
		text.style.color = "#ff4444";
	}
	if (subtext) {
		subtext.innerHTML = details;
		subtext.style.color = "white";
	}
	console.error(title, details);
}

// --- CONFIGURATION ---
const CONFIG = {
	DEFAULT_NUM_COLORS: 8,
	FRICTION: 0.985,
	MIN_STOP_SPEED: 0.05,
	MAX_SPIN_SPEED: 45,
	PINCH_START: 0.05,
	PINCH_RELEASE: 0.08,
	HAND_NEAR_WHEEL_RATIO: 1.4,
	// RESIZED: Smaller button dimensions
	BUTTON: { w: 160, h: 55, offset: 80 },
};

// --- STATE MANAGEMENT ---
class ColorWheelState {
	constructor() {
		this.numColors = CONFIG.DEFAULT_NUM_COLORS;
		this.rotationAngle = 0;
		this.isAutoSpinning = false;
		this.spinVelocity = 0;
		this.wheelCenter = { x: 0, y: 0 };
		this.wheelRadius = 0;
		this.handNearWheel = false;
		this.prevHandAngle = null;
		this.buttonState = { hovered: false, pressed: false };
		this.isPinching = false;
	}

	generateColors() {
		const colors = [];
		for (let i = 0; i < this.numColors; i++) {
			const hue = Math.floor((360 * i) / this.numColors);
			colors.push(hue);
		}
		return colors;
	}

	updatePhysics() {
		if (this.isAutoSpinning) {
			this.rotationAngle += this.spinVelocity;
			this.rotationAngle %= 360;
			this.spinVelocity *= CONFIG.FRICTION;
			if (Math.abs(this.spinVelocity) < CONFIG.MIN_STOP_SPEED) {
				this.isAutoSpinning = false;
				this.spinVelocity = 0;
				this.buttonState.pressed = false;
			}
		}
	}

	startSpin() {
		if (!this.isAutoSpinning) {
			this.spinVelocity = Math.random() * 15 + 20;
			if (Math.random() < 0.5) this.spinVelocity *= -1;
			this.isAutoSpinning = true;
		}
	}
}

if (
	typeof window.Hands === "undefined" ||
	typeof window.Camera === "undefined"
) {
	showError(
		"Network Error",
		"AI libraries failed to load.<br>Check internet connection."
	);
	throw new Error("Libraries missing");
}

const state = new ColorWheelState();
const canvasElement = document.querySelector(".output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const videoElement = document.querySelector(".input_video");

// --- GEOMETRY ---
function distance(p1, p2) {
	return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function getAngle(center, point) {
	const dy = point.y - center.y;
	const dx = point.x - center.x;
	let theta = Math.atan2(dy, dx);
	theta *= 180 / Math.PI;
	return theta;
}

// --- GRAPHICS ENGINE ---
function drawWheel(ctx, width, height) {
	// RESIZED: Moved slightly right (0.82) and made smaller radius
	const centerX = width * 0.82;
	const centerY = height / 2;
	// RESIZED: Denominator changed from 2.8 to 3.5 for smaller wheel
	const radius = Math.min(200, height / 3.5);

	state.wheelCenter = { x: centerX, y: centerY };
	state.wheelRadius = radius;

	const colors = state.generateColors();
	const anglePerSegment = (2 * Math.PI) / state.numColors;
	const rotationRad = state.rotationAngle * (Math.PI / 180);

	ctx.save();
	ctx.translate(centerX, centerY);
	ctx.rotate(rotationRad);
	ctx.shadowColor = "rgba(0,0,0,0.5)";
	ctx.shadowBlur = 20;
	ctx.shadowOffsetX = 5;
	ctx.shadowOffsetY = 5;

	for (let i = 0; i < state.numColors; i++) {
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.arc(0, 0, radius, i * anglePerSegment, (i + 1) * anglePerSegment);
		const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
		const hue = colors[i];
		gradient.addColorStop(0, `hsl(${hue}, 100%, 40%)`);
		gradient.addColorStop(0.8, `hsl(${hue}, 100%, 60%)`);
		gradient.addColorStop(1, `hsl(${hue}, 100%, 30%)`);
		ctx.fillStyle = gradient;
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = "rgba(0,0,0,0.2)";
		ctx.stroke();
	}
	ctx.restore();

	// Hub
	ctx.beginPath();
	ctx.arc(centerX, centerY, radius * 0.3, 0, 2 * Math.PI);
	const hubGrad = ctx.createRadialGradient(
		centerX,
		centerY,
		5,
		centerX,
		centerY,
		radius * 0.3
	);
	if (state.handNearWheel) {
		hubGrad.addColorStop(0, "#aaffaa");
		hubGrad.addColorStop(1, "#005500");
	} else {
		hubGrad.addColorStop(0, "#ffffff");
		hubGrad.addColorStop(1, "#777777");
	}
	ctx.fillStyle = hubGrad;
	ctx.fill();
	ctx.lineWidth = 4;
	ctx.strokeStyle = "#333";
	ctx.stroke();
	ctx.fillStyle = "rgba(0,0,0,0.8)";
	ctx.font = "bold 16px Segoe UI";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("GRAB", centerX, centerY);

	drawPointer(ctx, centerX, centerY, radius);
	drawSelectedColor(ctx, centerX, radius, colors);
	drawButton(ctx, centerX, centerY, radius);
}

function drawPointer(ctx, cx, cy, r) {
	const tipY = cy - r - 15;
	ctx.shadowColor = "rgba(0,0,0,0.5)";
	ctx.shadowBlur = 5;
	ctx.beginPath();
	ctx.moveTo(cx - 15, tipY - 20);
	ctx.lineTo(cx + 15, tipY - 20);
	ctx.lineTo(cx, tipY + 10);
	ctx.closePath();
	ctx.fillStyle = "white";
	ctx.fill();
	ctx.strokeStyle = "#333";
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.shadowBlur = 0;
}

function drawSelectedColor(ctx, cx, r, colors) {
	let currentRot = state.rotationAngle % 360;
	if (currentRot < 0) currentRot += 360;
	const pointerAngle = 270;
	const effectiveAngle = (pointerAngle - currentRot + 360) % 360;
	const anglePer = 360 / state.numColors;
	const index = Math.floor(effectiveAngle / anglePer) % state.numColors;
	const hue = colors[index];
	// RESIZED: Selection box smaller
	const bx = cx - 80;
	const by = 30;

	ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
	ctx.shadowBlur = 20;
	ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
	ctx.fillRect(bx, by, 160, 50);
	ctx.strokeStyle = "white";
	ctx.lineWidth = 3;
	ctx.strokeRect(bx, by, 160, 50);
	ctx.fillStyle = "white";
	ctx.shadowBlur = 0;
	ctx.font = "bold 18px Segoe UI";
	ctx.fillText("SELECTED", cx, by + 32);
}

function drawButton(ctx, cx, cy, r) {
	const btn = CONFIG.BUTTON;
	const bx = cx - btn.w / 2;
	const by = cy + r + btn.offset;
	state.buttonRect = { x: bx, y: by, w: btn.w, h: btn.h };

	let gradColors = ["#00c800", "#006400"];
	let text = "PINCH TO SPIN";
	let glow = 0;

	if (state.isAutoSpinning) {
		gradColors = ["#666", "#333"];
		text = "SPINNING...";
	} else if (state.buttonState.pressed) {
		gradColors = ["#004400", "#002200"];
		text = "SPINNING!";
	} else if (state.buttonState.hovered) {
		gradColors = ["#55ff55", "#00aa00"];
		text = "PINCH NOW!";
		glow = 20;
	}

	const grad = ctx.createLinearGradient(bx, by, bx, by + btn.h);
	grad.addColorStop(0, gradColors[0]);
	grad.addColorStop(1, gradColors[1]);

	if (glow > 0) {
		ctx.shadowColor = "#00ff00";
		ctx.shadowBlur = glow;
	}

	ctx.beginPath();
	const r_crn = 15;
	ctx.moveTo(bx + r_crn, by);
	ctx.arcTo(bx + btn.w, by, bx + btn.w, by + btn.h, r_crn);
	ctx.arcTo(bx + btn.w, by + btn.h, bx, by + btn.h, r_crn);
	ctx.arcTo(bx, by + btn.h, bx, by, r_crn);
	ctx.arcTo(bx, by, bx + btn.w, by, r_crn);
	ctx.closePath();

	ctx.fillStyle = grad;
	ctx.fill();
	ctx.lineWidth = 3;
	ctx.strokeStyle = "white";
	ctx.stroke();
	ctx.shadowBlur = 0;
	ctx.fillStyle = "white";
	ctx.font = "bold 18px Segoe UI";
	ctx.textAlign = "center";
	ctx.fillText(text, cx, by + btn.h / 2 + 6);
}

// --- MAIN LOOP ---
let hasLoaded = false;
setTimeout(() => {
	if (!hasLoaded)
		showError(
			"Timeout",
			"AI loading timed out.<br>Check your internet connection."
		);
}, 15000);

function onResults(results) {
	if (!hasLoaded) {
		hasLoaded = true;
		const l = document.getElementById("loading");
		if (l) l.style.display = "none";
	}

	// Set canvas to window size
	canvasElement.width = window.innerWidth;
	canvasElement.height = window.innerHeight;
	const w = canvasElement.width;
	const h = canvasElement.height;

	// --- FIX 1: CALCULATE ASPECT RATIO SCALING (COVER) ---
	const vidW = results.image.width;
	const vidH = results.image.height;

	// Calculate scale to cover the screen
	const scale = Math.max(w / vidW, h / vidH);
	const scaledW = vidW * scale;
	const scaledH = vidH * scale;

	// Center the video
	const xOffset = (w - scaledW) / 2;
	const yOffset = (h - scaledH) / 2;

	// 1. DRAW MIRRORED VIDEO WITH SCALING
	canvasCtx.save();
	canvasCtx.scale(-1, 1); // Mirror
	canvasCtx.translate(-w, 0); // Move back into frame

	// Draw image scaled to cover screen
	// Note: because we are mirrored/translated, xOffset applies inversely in visual terms
	// We draw at (w - (xOffset + scaledW)) effectively if we did manual math,
	// but with context transforms we just draw normally at offset.
	canvasCtx.drawImage(results.image, xOffset, yOffset, scaledW, scaledH);

	// Draw Skeleton (Scaled)
	if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
		// We need to adjust landmarks rendering if we drew video with offset/scale?
		// drawConnectors/drawLandmarks assumes 0-1 maps to full canvas.
		// If we use them directly, they will stretch.
		// For visual consistency with the "Cover" video, we should use manual drawing or manual mapping.
		// MediaPipe utils don't support 'offset/scale' easily.
		// Manual simple skeleton for perfect alignment:
		// (Skipping utility draw for accuracy)
	}
	canvasCtx.restore();

	// 2. UI LAYER (Normal Coordinates)
	state.updatePhysics();

	if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
		const landmarks = results.multiHandLandmarks[0];

		// --- FIX 2: MAP LANDMARKS TO SCALED VIDEO ---
		// Math:
		// 1. Get Normalized X (0-1). Mirror it (1-x).
		// 2. Multiply by the SCALED width.
		// 3. Add the Offset (xOffset).

		const indexFinger = {
			x: xOffset + (1 - landmarks[8].x) * scaledW,
			y: yOffset + landmarks[8].y * scaledH,
		};
		const thumb = {
			x: xOffset + (1 - landmarks[4].x) * scaledW,
			y: yOffset + landmarks[4].y * scaledH,
		};

		// PINCH LOGIC
		const pinchDist = distance(indexFinger, thumb);
		// Normalize pinch based on Scaled Width now
		const normalizedPinch = pinchDist / scaledW;

		if (state.isPinching) {
			if (normalizedPinch > CONFIG.PINCH_RELEASE) state.isPinching = false;
		} else {
			if (normalizedPinch < CONFIG.PINCH_START) state.isPinching = true;
		}

		// Visual Connection
		canvasCtx.beginPath();
		canvasCtx.moveTo(indexFinger.x, indexFinger.y);
		canvasCtx.lineTo(thumb.x, thumb.y);
		canvasCtx.lineWidth = 4;
		canvasCtx.strokeStyle = state.isPinching
			? "#00ff00"
			: "rgba(255,255,255,0.3)";
		canvasCtx.stroke();

		// BUTTON
		if (state.buttonRect) {
			const btn = state.buttonRect;
			const hit =
				indexFinger.x >= btn.x - 20 &&
				indexFinger.x <= btn.x + btn.w + 20 &&
				indexFinger.y >= btn.y - 20 &&
				indexFinger.y <= btn.y + btn.h + 20;

			state.buttonState.hovered = hit;
			if (
				hit &&
				state.isPinching &&
				!state.isAutoSpinning &&
				!state.buttonState.pressed
			) {
				state.buttonState.pressed = true;
				state.startSpin();
			}
			if ((!hit || !state.isPinching) && !state.isAutoSpinning)
				state.buttonState.pressed = false;
		}

		// WHEEL
		const distToCenter = distance(indexFinger, state.wheelCenter);
		state.handNearWheel =
			distToCenter < state.wheelRadius * CONFIG.HAND_NEAR_WHEEL_RATIO;

		if (
			state.handNearWheel &&
			!state.buttonState.hovered &&
			!state.isAutoSpinning
		) {
			const currentAngle = getAngle(state.wheelCenter, indexFinger);
			if (state.prevHandAngle !== null) {
				let diff = currentAngle - state.prevHandAngle;
				if (diff > 180) diff -= 360;
				if (diff < -180) diff += 360;
				state.rotationAngle += diff;
			}
			state.prevHandAngle = currentAngle;

			canvasCtx.beginPath();
			canvasCtx.moveTo(indexFinger.x, indexFinger.y);
			canvasCtx.lineTo(state.wheelCenter.x, state.wheelCenter.y);
			canvasCtx.strokeStyle = "rgba(0, 255, 0, 0.3)";
			canvasCtx.lineWidth = 2;
			canvasCtx.setLineDash([5, 5]);
			canvasCtx.stroke();
			canvasCtx.setLineDash([]);
		} else {
			state.prevHandAngle = null;
		}

		// CURSOR
		canvasCtx.beginPath();
		canvasCtx.arc(indexFinger.x, indexFinger.y, 15, 0, 2 * Math.PI);
		canvasCtx.fillStyle = state.isPinching
			? "#00ff00"
			: "rgba(255, 255, 255, 0.5)";
		canvasCtx.fill();
		canvasCtx.lineWidth = 3;
		canvasCtx.strokeStyle = "white";
		canvasCtx.stroke();
	}

	drawWheel(canvasCtx, w, h);
}

// --- SETUP ---
try {
	const hands = new Hands({
		locateFile: (file) =>
			`https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`,
	});
	hands.setOptions({
		maxNumHands: 1,
		modelComplexity: 1,
		minDetectionConfidence: 0.6,
		minTrackingConfidence: 0.6,
	});
	hands.onResults(onResults);

	const camera = new Camera(videoElement, {
		onFrame: async () => {
			await hands.send({ image: videoElement });
		},
		// Allow any resolution
	});
	camera.start().catch((e) => showError("Camera Error", e));
} catch (e) {
	showError("Startup Error", e.message);
}
