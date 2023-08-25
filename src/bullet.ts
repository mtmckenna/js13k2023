import {ICircle, IGridCell, IPoint, IPoolable, IPositionable} from "./interfaces";
import {generateVertices, updatePos} from "./game_objects";
import Grid, {GRID_SIZE_X, indexForPos} from "./grid";

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

    update(t: number) {
        this.lifeTime += t;
        if (this.lifeTime > this.maxLifeTime) this.active = false;

        const posX = this.pos.x + this.vel.x;
        const posY = this.pos.y + this.vel.y;
        this.angle += .01 % 2* Math.PI;

        updatePos(posX, posY, this);
    }
}