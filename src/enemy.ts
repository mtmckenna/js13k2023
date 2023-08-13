import {IGameObject, IGridCell, IPoint, IPoolPoint} from "./interfaces";
import Block from "./block";
import Grid from "./grid";
import {clamp, distanceBetweenPoints, squaredDistance} from "./math";
import {PointPool} from "./pools";

const ENEMY_MOVING_SPEED = .5;
const ENEMY_SEPARATION_FORCE = 1;
const ENEMY_ALIGNMENT_FORCE = .1;
const ENEMY_COHESION_FORCE = .1;
const ALIGNMENT_RADIUS = 100;
const COHESION_RADIUS = 100;
const SEPARATION_RADIUS = 100;
const MAX_FORCE = ENEMY_MOVING_SPEED;
const FORCE_UPDATE_TIME = 1;
const ROTOR_SIZE = 4;
const BODY_SIZE = 8;
const MIN_DISTANCE_SQUARED = 100*100;
const MAX_DISTANCE_SQUARED = 250*250;
export default class Enemy extends Block {
    size: IPoint = {x: 16, y: 16};
    index: number = 0;
    grid: Grid | null;
    player: IGameObject | null;
    neighborGridCells: IGridCell[];
    neighborEnemies: Enemy[] = [];
    numEnemies: number = 0;
    alignment: IPoint = {x: 0, y: 0};
    cohesion: IPoint = {x: 0, y: 0};
    separation: IPoint = {x: 0, y: 0};
    lastUpdateForceTime: number = 0;
    rotorAngle: number = 0;
    rotorRandomOffsets: number[] = [];
    rotorPositions: IPoint[] = [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x:0, y: 0}];
    time: number = 0;
    sign: number = 1;

    constructor(pos: IPoint = {x: 0, y: 0}, grid: Grid = null, player: IGameObject = null) {
        super();
        this.updatePos(pos.x, pos.y);
        this.color = "blue"
        this.grid = grid;
        this.player = player;
        this.neighborEnemies = new Array(25).fill(null);
        this.neighborGridCells = new Array(4).fill(null);
        const rand = Math.random()*100;
        this.vel.x =  Math.sin(rand)* ENEMY_MOVING_SPEED;
        this.vel.y = Math.cos(rand) * ENEMY_MOVING_SPEED;
        this.rotorRandomOffsets = new Array(4).fill(0).map(() => Math.random() * Math.PI * 2);
        this.sign = Math.random() > .5 ? 1 : -1;
    }

    draw(ctx: CanvasRenderingContext2D, scale: number = 1) {
        // super.draw(ctx, scale);
        const x = this.pos.x * scale;
        const y = this.pos.y * scale;
        const halfRotorSizeScaled = ROTOR_SIZE / 2 * scale;
        const rotorSizeScaled = ROTOR_SIZE * scale;
        const bodySizeScaled = BODY_SIZE * scale;

        ctx.fillStyle = "#313342";
        ctx.strokeStyle = "#fff";

        ctx.save();
        ctx.translate(x, y);
        // ctx.fillRect(x,y, 100,100);
        ctx.fillRect(0, 0, bodySizeScaled, bodySizeScaled);
        ctx.strokeRect(0, 0, bodySizeScaled, bodySizeScaled);
        ctx.restore();

        // Draw each rotor
        this.rotorAngle += 0.1;
        // this.rotorAngle = 0;
        for (let i = 0; i < this.rotorPositions.length; i++) {
            const pos = this.rotorPositions[i];
            const x = pos.x * scale;
            const y = pos.y * scale;
            ctx.save(); // Save the current context state
            // ctx.translate(x + halfRotorSizeScaled, y + halfRotorSizeScaled); // Move to the rotor center
            ctx.translate(x + halfRotorSizeScaled , y + halfRotorSizeScaled ); // Move to the rotor center
            // ctx.rotate(this.rotorAngle + this.rotorRandomOffsets[i]); // Rotate by the rotor angle
            ctx.rotate(this.rotorAngle);
            ctx.fillRect(-halfRotorSizeScaled, -halfRotorSizeScaled, rotorSizeScaled, rotorSizeScaled); // Draw the rotor
            ctx.strokeRect(-halfRotorSizeScaled, -halfRotorSizeScaled, rotorSizeScaled, rotorSizeScaled); // Draw the rotor outline
            ctx.restore(); // Restore the context state
        }
    }

    update(t: number) {
        if (!this.grid) return;
        this.time += t;
        const now = performance.now() / 1000;
        // console.log(now, FORCE_UPDATE_TIME);

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



        // Limit the vel to the max speed
        // const velMag = Math.sqrt(updatedVel.x * updatedVel.x + updatedVel.y * updatedVel.y);
        // if (velMag > ENEMY_MAX_SPEED) {
        //     updatedVel.x = (updatedVel.x / velMag) * ENEMY_MAX_SPEED;
        //     updatedVel.y = (updatedVel.y / velMag) * ENEMY_MAX_SPEED;
        // }

        this.vel.x = updatedVel.x;
        this.vel.y = updatedVel.y;

        const x = clamp(this.pos.x + this.vel.x, 0, this.grid.gameSize.x - this.grid.cellSize.x);
        const y = clamp(this.pos.y + this.vel.y, 0, this.grid.gameSize.y - this.grid.cellSize.y);
        this.updatePos(x, y);

        // const positions = [
        //     { x: x - ROTOR_SIZE + 1, y: y - ROTOR_SIZE + 1 },
        //     { x: x + this.size.x - 1, y: y - ROTOR_SIZE + 1 },
        //     { x: x - ROTOR_SIZE + 1, y: y + this.size.y -1 },
        //     { x: x + this.size.x - 1, y: y + this.size.y - 1},
        // ];

        // this.rotorPositions[0].x = x - ROTOR_SIZE + 1;
        // this.rotorPositions[0].y = y - ROTOR_SIZE + 1;
        //
        // this.rotorPositions[1].x = x + this.size.x - 1;
        // this.rotorPositions[1].y = y - ROTOR_SIZE + 1;
        //
        // this.rotorPositions[2].x = x - ROTOR_SIZE + 1;
        // this.rotorPositions[2].y = y + this.size.y -1;
        //
        // this.rotorPositions[3].x = x + this.size.x - 1;
        // this.rotorPositions[3].y = y + this.size.y - 1;

        this.rotorPositions[0].x = x - ROTOR_SIZE;
        this.rotorPositions[0].y = y - ROTOR_SIZE;

        this.rotorPositions[1].x = x + BODY_SIZE;
        this.rotorPositions[1].y = y - ROTOR_SIZE;

        this.rotorPositions[2].x = x - ROTOR_SIZE;
        this.rotorPositions[2].y = y + BODY_SIZE;

        this.rotorPositions[3].x = x + BODY_SIZE;
        this.rotorPositions[3].y = y + BODY_SIZE;

        this.index = this.grid.indexForPos(this.center.x, this.center.y);
        this.grid.addToEnemyMap(this);

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