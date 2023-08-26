import {ICircle, IGridCell, IPoint, IPositionable, IVehicleInputState} from "./interfaces";
import Grid from "./grid";
import {clamp, dot, getCos, getSin, normalizeVector, subtractVectors} from "./math";
import {drawPixels, updatePos} from "./game_objects";
import { PIXEL_SIZE} from "./constants";
import {BulletPool} from "./pools";

const TURNING_SPEED_THRESHOLD = 0.1;
const VEL_BOOST_ROAD = .25;
const MAX_CELLS = 100;

const PIXELS = [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 2, 2, 1, 0, 0],
    [0, 1, 1, 2, 2, 1, 1, 0],
    [0, 1, 2, 2, 2, 2, 1, 0],
    [0, 1, 2, 2, 2, 2, 1, 0],
    [1, 1, 2, 2, 2, 2, 1, 0],
    [1, 1, 2, 3, 3, 2, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 3, 3, 3, 3, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 2, 3, 3, 2, 1, 1],
    [0, 1, 2, 2, 2, 2, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
];

const PIXELS_COLOR_MAP = [null, "#663931", "#8f563b", "#fff"];

const boatCanvas = document.createElement("canvas");
const boatCtx = boatCanvas.getContext("2d");
const boatWidth = PIXELS[0].length * PIXEL_SIZE
const boatHeight = PIXELS.length * PIXEL_SIZE
boatCanvas.width = boatWidth;
boatCanvas.height = boatHeight;
export default class Boat implements IPositionable, ICircle {
    inputState: IVehicleInputState;
    grid: Grid;
    turnSpeed: number = .05;
    maxSpeed: number = 3;
    movingBackwards: boolean = false;
    acc: IPoint = {x: 0, y: 0};
    radius: number = 10
    center: IPoint = {x: 0, y: 0};
    pos: IPoint = {x: 0, y: 0};
    vel: IPoint = {x: 0, y: 0};
    angle: number = 0;
    size: IPoint = {x: boatWidth, y: boatHeight };
    color: string = "red";
    occupiedCells: IGridCell[] = new Array(2000).fill(null);
    numOccupiedCells: number = 0;
    vertices: IPoint[] = [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x:0, y: 0}];
    upgrades: string[] = [];
    direction: IPoint = {x: 1, y: 0};

    currentTime: number = 0;
    bulletDirection: IPoint = {x: 0, y: 0};
    bulletSpeed: number = 3;
    index: number = 0;

    // Weapons
    trackingGunSpeed: number = .2;
    trackingGunLastFiredTime: number = 0;

    forwardGun: boolean = false;
    forwardGunSpeed: number = .01;
    forwardGunLastFiredTime: number = 0;

    constructor(grid: Grid, inputState: IVehicleInputState) {
        this.inputState = inputState;
        this.color = "#b465c7"
        const widthHalf = this.size.x / 2;
        const heightHalf = this.size.y / 2;
        const radius = Math.sqrt(widthHalf * widthHalf + heightHalf * heightHalf);
        this.radius = radius;
        this.grid = grid;
        this.occupiedCells = new Array(MAX_CELLS).fill(null);

        updatePos(grid.gameSize.x / 2, grid.gameSize.y / 2, this);
        drawPixels(boatCtx, PIXELS, PIXELS_COLOR_MAP, PIXEL_SIZE);
    }

    get speed(): number {
        return Math.hypot(this.vel.x, this.vel.y);
    }
    turnKeyboard() {
        if (Math.abs(this.speed) < TURNING_SPEED_THRESHOLD) return;
        let sign = Math.sign(this.inputState.pos.x);
        if (this.movingBackwards) {
            sign = -sign
        }

        this.angle += this.turnSpeed * Math.abs(this.speed/this.maxSpeed) * sign % (Math.PI * 2);
    }

    turnJoyStick() {
        let magnitude = Math.hypot(this.inputState.pos.x, this.inputState.pos.y);

        if (magnitude > 0) {
            this.angle = Math.atan2(-this.inputState.pos.y, this.inputState.pos.x) + Math.PI/2;
        }
    }

    updateVel() {
        const onRoad = true;
        const accMagnitude = (onRoad ? VEL_BOOST_ROAD : VEL_BOOST_ROAD*.5);
        const maxSpeed = onRoad ? this.maxSpeed : this.maxSpeed*.5;

        let direction = Math.hypot(this.inputState.pos.x, this.inputState.pos.y); // JS magnitude
        if (this.inputState.mode === "kb") direction = Math.sign(this.inputState.pos.y); // Keyboard magnitude

        const cos = getCos(this.angle - Math.PI/2);
        const sin = getSin(this.angle - Math.PI/2);
        this.acc.x = cos * direction * accMagnitude;
        this.acc.y = sin * direction * accMagnitude;

        this.vel.x += this.acc.x;
        this.vel.y += this.acc.y;

        // Limit the speed to the maximum speed
        const speed = Math.hypot(this.vel.x, this.vel.y);
        if (speed > maxSpeed) {
            const scaleFactor = maxSpeed / speed;
            this.vel.x *= scaleFactor;
            this.vel.y *= scaleFactor;
        }

        // Apply damping to gradually slow down the velocity
        const FRICTION = .95;
        this.vel.x *= FRICTION;
        this.vel.y *= FRICTION;

        this.movingBackwards = this.inputState.mode === "kb" && this.inputState.pos.y < 0;
        this.direction.x = getCos(this.angle - Math.PI/2);
        this.direction.y = getSin(this.angle - Math.PI/2);
    }

    update(t: number): void {
        this.currentTime += t;

        if (this.inputState.mode === "js") {
            this.turnJoyStick();
        } else {
            this.turnKeyboard();
        }

        this.updateVel();

        // update player pos but mind the edges of the canvas
        const x = clamp(this.pos.x + this.vel.x, 0, this.grid.gameSize.x - this.size.x);
        const y = clamp(this.pos.y + this.vel.y, 0, this.grid.gameSize.y - this.size.y);
        updatePos(x, y, this);

        if ((this.currentTime - this.trackingGunLastFiredTime) > this.trackingGunSpeed) {
            this.trackingGunLastFiredTime = this.currentTime;
            const enemy = this.grid.getNearestEnemy(this.center)
            if (!enemy) return;
            normalizeVector(subtractVectors(enemy.center, this.center, this.bulletDirection), this.bulletDirection);
            this.bulletDirection.x += this.vel.x;
            this.bulletDirection.y += this.vel.y;
            normalizeVector(this.bulletDirection, this.bulletDirection); // Re-normalize after adjustments
            const dotProduct = dot(this.bulletDirection, this.direction);
            shootGun(this.center, this.bulletDirection, this.bulletSpeed + this.speed * dotProduct);
        }

        if (this.forwardGun && (this.currentTime - this.forwardGunLastFiredTime) > this.forwardGunSpeed) {
            this.forwardGunLastFiredTime = this.currentTime;
            shootGun(this.center, this.direction, this.bulletSpeed + this.speed);
        }
    }

    draw(ctx: CanvasRenderingContext2D, scale:number = 1): void {
        ctx.save();
        ctx.translate(this.center.x * scale, this.center.y * scale);
        ctx.rotate(this.angle);
        ctx.imageSmoothingEnabled = false;  // Ensure no smoothing for main canvas
        ctx.drawImage(boatCanvas, 0, 0, this.size.x, this.size.y, -this.size.x/2*scale, -this.size.y/2*scale, this.size.x * scale, this.size.y * scale);

        ctx.restore();
    }
}

function shootGun(pos: IPoint, direction: IPoint, speed: number = 1.5) {
    const bullet = BulletPool.get(pos.x, pos.y);
    bullet.vel.x = direction.x * speed;
    bullet.vel.y = direction.y * speed;
    return bullet;
}