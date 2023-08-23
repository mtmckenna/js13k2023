import {IGridCell, IPoint, IPoolPoint, IPositionable} from "./interfaces";
import Grid, {GRID_CELL_SIZE, GRID_SIZE_X, indexForPos} from "./grid";
import {
    clamp,
    distanceBetweenPoints,
    getCos,
    getSin,
    limitVector,
    normalizeAndScaleVector, normalizeVector,
    squaredDistance,
    subtractVectors
} from "./math";
import {PointPool} from "./pools";
import {drawPixels, PIXEL_SIZE, updatePos} from "./game_objects";
import Boat from "./boat";

const ENEMY_MOVING_SPEED = 1.5;
const MAX_FORCE = ENEMY_MOVING_SPEED;
const ENEMY_SEPARATION_FORCE = 2;
const ENEMY_ALIGNMENT_FORCE = 0.0;
const ENEMY_COHESION_FORCE = 0.0;
const PLAYER_ATTRACTION_FORCE = 2.1;
const PERCEPTION_RADIUS = 500;
const MAX_DISTANCE_SQUARED = GRID_CELL_SIZE * GRID_CELL_SIZE;
const OVERCOMMIT_DISTANCE = 100;
const REENGAGE_DISTANCE = 100;
const MAX_RETURN_SPEED = ENEMY_MOVING_SPEED;
const DECELERATION = 0.9; // Decelerate by 10% every frame while overcommitting.


const PIXELS = [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 2, 1, 1, 2, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0],
];

const PIXELS_COLOR_MAP = [null, "#fff", "#000"];

const FRINGE_AMPLITUDE = PIXEL_SIZE;  // Height of wave
const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d");
const characterWidth = PIXELS[0].length * PIXEL_SIZE
const characterHeight = PIXELS.length * PIXEL_SIZE + FRINGE_AMPLITUDE * 2;
offscreenCanvas.width = characterWidth;
offscreenCanvas.height = characterHeight;

const spriteSheetCanvas = document.createElement("canvas");
const NUM_FRAMES = 120;
createSpriteSheet({x: characterWidth, y: characterHeight})

export default class Enemy implements IPositionable {
    size: IPoint = {x: 8 * PIXEL_SIZE, y: 8 * PIXEL_SIZE};
    index: number = 0;
    grid: Grid | null;
    player: IPositionable | null;
    neighborGridCells: IGridCell[];
    neighborEnemies: Enemy[] = [];
    numEnemies: number = 0;
    alignment: IPoint = {x: 0, y: 0};
    cohesion: IPoint = {x: 0, y: 0};
    separation: IPoint = {x: 0, y: 0};
    attraction: IPoint = {x: 0, y: 0};
    lastUpdateForceTime: number = 0;
    overcommitting: boolean = false;
    returning: boolean = false;
    overcommitDistanceMoved: number = 0;
     passedPlayer: boolean = false;
     overcommitEndTime: number | null = null;
    overcommitAmount: IPoint = {x: 0, y: 0};
    rotorRandomOffsets: number[] = [];
    time: number = 0;
    sign: number = 1;
    pos: IPoint = {x: 0, y: 0};
    center: IPoint = {x: 0, y: 0};
    vel: IPoint = {x: 0, y: 0};
    angle: number = 0;
    occupiedCells: IGridCell[] = new Array(2000).fill(null);
    numOccupiedCells: number = 0;
    vertices: IPoint[] = [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}];
    forwardDirection: boolean = true;
    frameCounter: number = 0;

    constructor(pos: IPoint = {x: 0, y: 0}, grid: Grid = null, player: IPositionable = null) {
        this.grid = grid;
        updatePos(pos.x, pos.y, this);
        this.player = player;
        this.neighborEnemies = new Array(25).fill(null);
        this.neighborGridCells = new Array(4).fill(null);
        const rand = Math.random() * 100;
        const cos = getCos(rand);
        const sin = getSin(rand);
        this.vel.x = cos * ENEMY_MOVING_SPEED;
        this.vel.y = sin * ENEMY_MOVING_SPEED;
        this.rotorRandomOffsets = new Array(4).fill(0).map(() => Math.random() * Math.PI * 2);
        this.sign = Math.random() > .5 ? 1 : -1;
        drawPixels(offscreenCanvas, offscreenCtx, PIXELS, PIXELS_COLOR_MAP, PIXEL_SIZE);
        this.frameCounter = Math.floor(Math.random() * NUM_FRAMES);
    }

    draw(ctx: CanvasRenderingContext2D, scale: number = 1, t: number) {

        ctx.save();
        ctx.translate(this.center.x * scale, this.center.y * scale);
        ctx.rotate(this.angle);
        ctx.imageSmoothingEnabled = false;

        const sx = this.frameCounter * this.size.x; // source x on sprite sheet
        ctx.drawImage(spriteSheetCanvas, sx, 0, this.size.x, this.size.y + FRINGE_AMPLITUDE, -this.size.x / 2 * scale, -this.size.y / 2 * scale, this.size.x * scale, (this.size.y + FRINGE_AMPLITUDE) * scale);

        ctx.restore();

        if (this.forwardDirection) {
            this.frameCounter++;
            if (this.frameCounter >= NUM_FRAMES - 1) {
                this.forwardDirection = false;
            }
        } else {
            this.frameCounter--;
            if (this.frameCounter <= 0) {
                this.forwardDirection = true;
            }
        }
    }

    update(t: number) {
        if (!this.grid || !this.player) return;
        this.time += t;

        const dirToPlayer = PointPool.get();
        normalizeVector({x: this.player.center.x - this.center.x, y: this.player.center.y - this.center.y}, dirToPlayer);

        const DECAY = 0.05;
        if (Math.sign(this.vel.x) !== Math.sign(dirToPlayer.x)) {
            this.vel.x = this.vel.x + Math.sign(dirToPlayer.x) * DECAY;
        } else {
            this.vel.x = dirToPlayer.x * ENEMY_MOVING_SPEED;
        }

        if (Math.sign(this.vel.y) !== Math.sign(dirToPlayer.y)) {
            this.vel.y = this.vel.y + Math.sign(dirToPlayer.y) * DECAY
        } else {
            this.vel.y = dirToPlayer.y * ENEMY_MOVING_SPEED;
        }

        const x = clamp(this.pos.x + this.vel.x, 0, this.grid.gameSize.x - this.size.x);
        const y = clamp(this.pos.y + this.vel.y, 0, this.grid.gameSize.y - this.size.y);
        updatePos(x, y, this);

        PointPool.release(dirToPlayer);
    }

    setNeighborEnemies(index: number, currentEnemy: Enemy, grid: Grid, neighborGridCells: IGridCell[], enemies: Enemy[]): Enemy[] {
        grid.setNeighborGridCells(index, neighborGridCells);

        let numEnemies = 0;

        const currentGridCell = grid.cells[index];
        for (let i = 0; i < currentGridCell.numEnemies; i++) {
            const enemy = currentGridCell.enemies[i];
            if (enemy !== currentEnemy) {
                enemies[numEnemies] = enemy;
                numEnemies++;
            }
        }

        for (let i = 0; i < neighborGridCells.length; i++) {
            const neighbor = neighborGridCells[i];
            if (!neighbor || neighbor.index === index) continue;
            for (let i = 0; i < neighbor.numEnemies; i++) {
                const enemy = neighbor.enemies[i];
                if (enemy !== currentEnemy) {
                    enemies[numEnemies] = enemy;
                    numEnemies++;
                }
            }
        }

        for (let i = numEnemies; i < enemies.length; i++) {
            enemies[i] = null;
        }

        this.numEnemies = numEnemies;

        return enemies;
    }
}

function calculateFlockingForces(enemy: Enemy, player: IPositionable, enemies: Enemy[], alignment: IPoint, cohesion: IPoint, separation: IPoint, attraction: IPoint) {
    let neighbors = 0;
    let separationNeighbors = 0;
    separation.x = 0;
    separation.y = 0;
    alignment.x = 0;
    alignment.y = 0;
    cohesion.x = 0;
    cohesion.y = 0;
    attraction.x = 0;
    attraction.y = 0;

    if (player) {
        let dx = enemy.pos.x - player.pos.x;
        let dy = enemy.pos.y - player.pos.y;
        // let distance = distanceBetweenPoints(enemy.pos, player.pos)
        // let distance = Math.abs(dx) + Math.abs(dy); // Manhattan distance
        let distance = Math.hypot(dx, dy);

        if (distance < Number.EPSILON) distance = Number.EPSILON;

        if (distance < PERCEPTION_RADIUS) {
            attraction.x -= dx / distance;
            attraction.y -= dy / distance;
            // attraction.x -= dx;
            // attraction.y -= dy;
        }

        normalizeAndScaleVector(attraction, ENEMY_MOVING_SPEED, attraction);
        subtractVectors(attraction, enemy.vel, attraction);
        limitVector(attraction, MAX_FORCE, attraction);
    }

    for (let i = 0; i < enemies.length; i++) {
        const other = enemies[i];
        if (!other || other === enemy) continue;
        let dx = enemy.pos.x - other.pos.x;
        let dy = enemy.pos.y - other.pos.y;
        // let distance = Math.abs(dx) + Math.abs(dy); // Manhattan distance
        // let distance = distanceBetweenPoints(enemy.pos, other.pos)
        let distance = Math.hypot(dx, dy);
        let distanceToPlayer = distanceBetweenPoints(enemy.pos, player.pos);

        if (distance < Number.EPSILON) distance = Number.EPSILON;
        if (distanceToPlayer < Number.EPSILON) distanceToPlayer = Number.EPSILON;

        if (distance < PERCEPTION_RADIUS) {
            alignment.x += other.vel.x;
            alignment.y += other.vel.y;
            cohesion.x += other.pos.x;
            cohesion.y += other.pos.y;
            attraction.x -= dx / distance;
            attraction.y -= dy / distance;

            neighbors++;
        }

        if (distance < 50) {
            separation.x += dx / distance;
            separation.y += dy / distance;
            const randomDirection = Math.random() > .5 ? 1 : -1;
            if (separation.x < Number.EPSILON) separation.x = 1  * randomDirection
            if (separation.y < Number.EPSILON) separation.y = 1 * randomDirection;
            separationNeighbors++;
        }
    }

    if (neighbors > 0) {
        alignment.x /= neighbors;
        alignment.y /= neighbors;
        alignment.x -= enemy.vel.x;
        alignment.y -= enemy.vel.y;

        cohesion.x /= neighbors;
        cohesion.y /= neighbors;
        cohesion.x -= enemy.pos.x;
        cohesion.y -= enemy.pos.y;

        normalizeAndScaleVector(alignment, ENEMY_MOVING_SPEED, alignment);
        subtractVectors(alignment, enemy.vel, alignment);
        limitVector(alignment, MAX_FORCE, alignment);

        normalizeAndScaleVector(cohesion, ENEMY_MOVING_SPEED, cohesion);
        subtractVectors(cohesion, enemy.vel, cohesion);
        limitVector(cohesion, MAX_FORCE, cohesion);
    }

    if (separationNeighbors > 0) {
        separation.x /= separationNeighbors;
        separation.y /= separationNeighbors;
        normalizeAndScaleVector(separation, ENEMY_MOVING_SPEED, separation);
        subtractVectors(separation, enemy.vel, separation);
        limitVector(separation, MAX_FORCE, separation);
    }

    // attraction.x = 0;
    // attraction.y = 0;
}

function createSpriteSheet(size: IPoint) {
    spriteSheetCanvas.width = size.x * NUM_FRAMES;
    spriteSheetCanvas.height = size.y + FRINGE_AMPLITUDE;
    const spriteSheetCtx = spriteSheetCanvas.getContext('2d');

    for (let frame = 0; frame < NUM_FRAMES; frame++) {
        const t = frame / 60 * 1000; // convert frame number to time (assuming 60fps)

        // Render the ghost's body
        const xOffset = frame * size.x;
        drawPixels(spriteSheetCanvas, spriteSheetCtx, PIXELS, PIXELS_COLOR_MAP, PIXEL_SIZE, xOffset);

        // Render the ghost's fringe
        const yBase = 7 * PIXEL_SIZE;
        const numWaves = 7;
        const frequency = (2 * Math.PI) / (size.x / numWaves);
        for (let x = 0; x < size.x; x += PIXEL_SIZE) {
            const sin = getSin(frequency * (x / PIXEL_SIZE) + (t / 100));
            const yOffset = FRINGE_AMPLITUDE * sin
            const h = FRINGE_AMPLITUDE + yOffset;
            spriteSheetCtx.fillStyle = PIXELS_COLOR_MAP[1];
            spriteSheetCtx.fillRect(frame * size.x + x, yBase, PIXEL_SIZE, h);
        }

        // Render the ghost's mouth
        const mouthSize = PIXEL_SIZE * 2 * (1 - Math.abs((t % 2000) - 1000) / 1000);
        const sin = getSin(t / 100);
        const cos = getCos(t / 100);
        const mouthX = PIXEL_SIZE * 4 + sin;
        const mouthY = PIXEL_SIZE * 5 + cos;
        spriteSheetCtx.fillStyle = "#000";
        spriteSheetCtx.fillRect(frame * size.x + (mouthX - mouthSize / 2), (mouthY - mouthSize / 2), mouthSize, mouthSize);
    }

    return spriteSheetCanvas;
}