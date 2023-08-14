import {IGridCell, IPoint, IPoolPoint, IPositionable} from "./interfaces";
import Grid from "./grid";
import {clamp, squaredDistance} from "./math";
import {PointPool} from "./pools";
import {drawPixels, PIXEL_SIZE, updatePos} from "./game_objects";

const ENEMY_MOVING_SPEED = .5;
const ENEMY_SEPARATION_FORCE = 1;
const ENEMY_ALIGNMENT_FORCE = .1;
const ENEMY_COHESION_FORCE = .1;
const ALIGNMENT_RADIUS = 100;
const COHESION_RADIUS = 100;
const SEPARATION_RADIUS = 100;
const MAX_FORCE = ENEMY_MOVING_SPEED;
const FORCE_UPDATE_TIME = 1;
const MIN_DISTANCE_SQUARED = 100*100;
const MAX_DISTANCE_SQUARED = 250*250;

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
const characterHeight = PIXELS.length * PIXEL_SIZE + FRINGE_AMPLITUDE*2;
offscreenCanvas.width = characterWidth;
offscreenCanvas.height = characterHeight;

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
    lastUpdateForceTime: number = 0;
    rotorRandomOffsets: number[] = [];
    time: number = 0;
    sign: number = 1;
    pos: IPoint = {x: 0, y: 0};
    center: IPoint = {x: 0, y: 0};
    vel: IPoint = {x: 0, y: 0};
    angle: number = 0;
    occupiedCells: IGridCell[] = new Array(2000).fill(null);
    numOccupiedCells: number = 0;
    vertices: IPoint[] = [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x:0, y: 0}];

    constructor(pos: IPoint = {x: 0, y: 0}, grid: Grid = null, player: IPositionable = null) {
        updatePos(pos.x, pos.y, this);
        this.grid = grid;
        this.player = player;
        this.neighborEnemies = new Array(25).fill(null);
        this.neighborGridCells = new Array(4).fill(null);
        const rand = Math.random()*100;
        this.vel.x =  Math.sin(rand)* ENEMY_MOVING_SPEED;
        this.vel.y = Math.cos(rand) * ENEMY_MOVING_SPEED;
        this.rotorRandomOffsets = new Array(4).fill(0).map(() => Math.random() * Math.PI * 2);
        this.sign = Math.random() > .5 ? 1 : -1;
        drawPixels(offscreenCanvas, offscreenCtx, PIXELS, PIXELS_COLOR_MAP, PIXEL_SIZE);
    }

    draw(ctx: CanvasRenderingContext2D, scale: number = 1, t: number) {
        drawPixels(offscreenCanvas, offscreenCtx, PIXELS, PIXELS_COLOR_MAP, PIXEL_SIZE);

        // draw fringe
        const yBase = 7 * PIXEL_SIZE;  // This is the base y position for the 8th row
        const numWaves = 7;
        const frequency = (2 * Math.PI) / (this.size.x / numWaves);  // Adjust frequency
        for (let x = 0; x < this.size.x; x += PIXEL_SIZE) {
            const yOffset = FRINGE_AMPLITUDE * Math.sin(frequency * (x/PIXEL_SIZE) + (t / 100));  // Negate the result
            const h = FRINGE_AMPLITUDE+yOffset;
            offscreenCtx.fillStyle = PIXELS_COLOR_MAP[1];  // Ghost color
            offscreenCtx.fillRect(x, yBase, PIXEL_SIZE, h);  // Fill rectangle with ghost color and adjusted position
        }


        ctx.save();
        ctx.translate(this.center.x * scale, this.center.y * scale);
        ctx.rotate(this.angle);
        ctx.imageSmoothingEnabled = false;  // Ensure no smoothing for main canvas
        ctx.drawImage(offscreenCanvas, 0, 0, this.size.x, this.size.y + FRINGE_AMPLITUDE, -this.size.x/2*scale, -this.size.y/2*scale, this.size.x * scale, (this.size.y+FRINGE_AMPLITUDE) * scale);
        ctx.restore();


        // draw mouth
        ctx.save();
        const mouthSize = PIXEL_SIZE * 2 * (1 - Math.abs((t % 2000) - 1000) / 1000);

        const mouthX = PIXEL_SIZE * 4 + Math.sin(t / 50);
        const mouthY = PIXEL_SIZE * 5 + Math.cos(t / 50);
        ctx.translate(this.pos.x * scale, this.pos.y * scale);
        ctx.fillStyle = "#000";
        ctx.fillRect((mouthX - mouthSize/2) * scale, (mouthY - mouthSize/2) * scale, mouthSize * scale, mouthSize * scale);
        ctx.restore();
    }

    update(t: number) {
        if (!this.grid) return;
        this.time += t;
        const now = performance.now() / 1000;

        let updateForce = false;
        if (now - this.lastUpdateForceTime > FORCE_UPDATE_TIME) {
            this.lastUpdateForceTime = now;
            updateForce = true;
        }

        this.lastUpdateForceTime = t;
        this.neighborEnemiesFromCellIndex(this.index, this, this.grid, this.neighborGridCells, this.neighborEnemies);
        calculateFlockingForces(this, this.neighborEnemies, this.alignment, this.cohesion, this.separation);

        const updatedVel: IPoolPoint = PointPool.get(0,0);

        if (updateForce) {
            const forcesVel: IPoolPoint = PointPool.get(0, 0);
            forcesVel.x = this.separation.x * ENEMY_SEPARATION_FORCE + this.alignment.x * ENEMY_ALIGNMENT_FORCE + this.cohesion.x * ENEMY_COHESION_FORCE;
            forcesVel.y = this.separation.y * ENEMY_SEPARATION_FORCE + this.alignment.y * ENEMY_ALIGNMENT_FORCE + this.cohesion.y * ENEMY_COHESION_FORCE;
            const forcesVelMag = Math.hypot(forcesVel.x, forcesVel.y);

            if (forcesVelMag > MAX_FORCE) {
                forcesVel.x = (forcesVel.x / forcesVelMag) * MAX_FORCE;
                forcesVel.y = (forcesVel.y / forcesVelMag) * MAX_FORCE;
            }

            updatedVel.x += forcesVel.x;
            updatedVel.y += forcesVel.y;
            PointPool.release(forcesVel);

            if (this.player &&
                squaredDistance(this.player.center, this.center) > MIN_DISTANCE_SQUARED &&
                squaredDistance(this.player.center, this.center) < MAX_DISTANCE_SQUARED) {
                updatedVel.x += Math.sign(this.player.center.x - this.center.x) * ENEMY_MOVING_SPEED;
                updatedVel.y += Math.sign(this.player.center.y - this.center.y) * ENEMY_MOVING_SPEED;
            } else {
                // go in a circle using sin
                updatedVel.x += Math.sin(this.time) * ENEMY_MOVING_SPEED * this.sign;
                updatedVel.y += Math.cos(this.time) * ENEMY_MOVING_SPEED * this.sign;
            }
        } else {
            // continue on existing direction
            updatedVel.x = this.vel.x;
            updatedVel.y = this.vel.y;
        }

        this.vel.x = updatedVel.x;
        this.vel.y = updatedVel.y;

        const x = clamp(this.pos.x + this.vel.x, 0, this.grid.gameSize.x - this.grid.cellSize.x);
        const y = clamp(this.pos.y + this.vel.y, 0, this.grid.gameSize.y - this.grid.cellSize.y);
        updatePos(x, y, this);
        PointPool.release(updatedVel);

    }

    neighborEnemiesFromCellIndex(index: number, currentEnemy: Enemy, grid: Grid, neighborGridCells: IGridCell[], enemies: Enemy[]): Enemy[] {
        grid.getNeighbors(index, neighborGridCells);

        let numEnemies = 0;

        for (let neighbor of neighborGridCells) {
            if (!neighbor || neighbor.index === index) continue;
            // const enemiesAtIndex = grid.enemiesAtIndex(neighbor.index);
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

function calculateFlockingForces(enemy: Enemy, enemies: Enemy[], alignment: IPoint, cohesion: IPoint, separation: IPoint) {
    let neighbors = 0;

    for (let i = 0; i < enemies.length; i++) {
        const other = enemies[i];
        if (!other || other === enemy) continue;
        let dx = enemy.pos.x - other.pos.x;
        let dy = enemy.pos.y - other.pos.y;
        let distance = Math.abs(dx) + Math.abs(dy); // Manhattan distance

        // if (distance < Number.EPSILON) distance = Number.EPSILON;
        if (distance < Number.EPSILON) distance = Number.EPSILON;

        if (distance < SEPARATION_RADIUS) {
            separation.x += dx / distance;
            separation.y += dy / distance;
        }

        if (distance < ALIGNMENT_RADIUS) {
            alignment.x += other.vel.x;
            alignment.y += other.vel.y;
        }

        if (distance < COHESION_RADIUS) {
            cohesion.x += other.pos.x;
            cohesion.y += other.pos.y;
        }

        neighbors++;
    }

    if (neighbors > 0) {
        alignment.x /= neighbors;
        alignment.y /= neighbors;

        cohesion.x /= neighbors;
        cohesion.y /= neighbors;

        cohesion.x -= enemy.pos.x;
        cohesion.y -= enemy.pos.y;
    }
}