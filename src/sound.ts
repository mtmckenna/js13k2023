// const audioCtx = new (window.AudioContext ? window.AudioContext : window.webkitAudioContext)();
let audioCtx: AudioContext = null;
let cannonBuffer:AudioBuffer , hitPlayerBuffer: AudioBuffer, hitEnemyBuffer: AudioBuffer;
function createContext() {
    if (ready) return;
    audioCtx = new (window.AudioContext ? window.AudioContext : window.webkitAudioContext)();

    cannonBuffer = generateCannonBallSoundBuffer();
    hitPlayerBuffer = generatePlayerHitSoundBuffer();
    hitEnemyBuffer = generateEnemyHitSoundBuffer();
    ready = true;
}

window.addEventListener('touchstart', createContext);
window.addEventListener('mousedown', createContext);
window.addEventListener('keydown', createContext);


const SOUNDS = {
    CANNON_SHOOT: 0,
    PLAYER_HIT: 1,
    CANNON_BALL_HIT: 2
};

let ready = false;

const COOLDOWNS = [100, 200, 300];
const lastPlayed = [0, 0, 0]; // Assuming you have 3 sounds



function generateCannonBallSoundBuffer(): AudioBuffer {
    const duration = 0.1;  // Very brief duration.
    const frameCount = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, frameCount, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
        const time = i / audioCtx.sampleRate;
        const amplitude = Math.exp(-15 * time);  // Rapid fade-out for a soft "pluck" sound.
        data[i] = amplitude * Math.sin(75 * Math.PI * 2 * time); // Slightly higher frequency for a light sound.
    }

    return buffer;
}

function generateEnemyHitSoundBuffer(): AudioBuffer {
    const duration = 0.15;  // Slightly longer than the cannonball sound, but still brief.
    const frameCount = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, frameCount, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
        const time = i / audioCtx.sampleRate;
        const amplitude = Math.exp(-10 * time);  // Dampening for the "thud" effect.
        data[i] = amplitude * Math.sin(100 * Math.PI * 2 * time);  // Lower frequency for a deeper sound.
    }

    return buffer;
}

function generatePlayerHitSoundBuffer(): AudioBuffer {
    const duration = 0.3;
    const frameCount = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, frameCount, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    const freq = 120;

    for (let i = 0; i < frameCount; i++) {
        const time = i / audioCtx.sampleRate;
        const amplitude = Math.exp(-1.5 * time);
        data[i] = amplitude * (Math.sin(freq * Math.PI * 2 * time) * (1 - time));  // Modulating the sound to taper off.
    }

    return buffer;
}
function canPlaySound(soundId) {
    const now = performance.now();
    if (now - lastPlayed[soundId] > COOLDOWNS[soundId]) {
        lastPlayed[soundId] = now;
        return true;
    }
    return false;
}

function playBuffer(buffer, soundId) {
    if (!ready) return;
    if (canPlaySound(soundId)) {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start();
    }
}
export function playCannonSound() {
    playBuffer(cannonBuffer, SOUNDS.CANNON_SHOOT);
}

export function playHitPlayerSound() {
    playBuffer(hitPlayerBuffer, SOUNDS.PLAYER_HIT);
}
export function playCannonballHitEnemySound() {
    playBuffer(hitEnemyBuffer, SOUNDS.CANNON_BALL_HIT);
}
