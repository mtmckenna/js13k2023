import {ICircle, IGridCell, IPoint, IPoolable, IPositionable} from "./interfaces";
import {generateVertices, updatePos} from "./game_objects";
import Grid, {GRID_SIZE_X, indexForPos} from "./grid";
import {clamp} from "./math";

export class Bullet implements IPositionable, ICircle, IPoolable {
    angle: number = 0;
    center: IPoint= {x: 0, y: 0};
    numOccupiedCells: number = 0;
    occupiedCells: IGridCell[] = [];
    pos: IPoint = {x: 0, y: 0};
    radius: number = 5;
    size: IPoint = {x: 10, y: 10};
    vertices: IPoint[] = [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x:0, y: 0}];
    vel: IPoint = {x: 0, y: 0};
    lifeTime: number = 0;
    maxLifeTime: number = 2;
    active: boolean = false;
    index: number = 0;
    color: string = "#000";
    type: "bullet" | "particle" = "bullet";

    update(t: number) {
        this.lifeTime += t;
        if (this.lifeTime > this.maxLifeTime) this.active = false;

        const posX = this.pos.x + this.vel.x;
        const posY = this.pos.y + this.vel.y;
        this.angle += .01 % 2* Math.PI;

        if (this.type === "particle") {
            // apply gravity
            this.vel.y += .2;
            this.vel.y = clamp(this.vel.y, -5, 5);
        }

        updatePos(posX, posY, this);
    }

    makeParticle() {
        this.type = "particle";
        this.maxLifeTime = 1;
        this.radius = 5;
        this.color = "#fff";
        this.vel.y = -3;
        this.vel.x = Math.random() * 3 - 1;
    }

    makeBullet() {
        this.type = "bullet";
        this.maxLifeTime = 2;
        this.radius = 5;
        this.color = "#000";
    }
}