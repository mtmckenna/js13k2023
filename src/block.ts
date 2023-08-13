import {IGameObject, IGridCell, IPoint} from "./interfaces";
import Vehicle from "./vehicle";
export default class Block implements IGameObject {
    public angle: number = 0;
    vel: IPoint = {x: 0, y: 0};
    pos: IPoint = {x: 0, y: 0};
    center: IPoint = {x: 0, y: 0};
    size: IPoint = {x: 16, y: 16};
    color: string = "orange";
    occupiedCells: IGridCell[] = new Array(2000).fill(null);
    numOccupiedCells: number = 0;
    vertices: IPoint[] = [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x:0, y: 0}];

    update(t: number): void {}

    draw(ctx: CanvasRenderingContext2D, scale: number = 1) {
        ctx.save();
        ctx.translate(this.center.x*scale, this.center.y*scale);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size.x/2*scale, -this.size.y/2*scale, this.size.x*scale, this.size.y*scale);
        ctx.restore();
    }

    updatePos(x: number, y: number): void {
        this.pos.x = x;
        this.pos.y = y;
        this.center.x = this.pos.x + this.size.x / 2;
        this.center.y = this.pos.y + this.size.y / 2;
        this.generateVertices();
    }

    generateVertices() {
        const { center, size, angle } = this;
        const { x: width, y: height } = size;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);

        this.vertices[0].x = -width / 2;
        this.vertices[0].y = -height / 2;
        this.vertices[1].x = width / 2;
        this.vertices[1].y = -height / 2;
        this.vertices[2].x = width / 2;
        this.vertices[2].y = height / 2;
        this.vertices[3].x = -width / 2;
        this.vertices[3].y = height / 2;

        for (const vertex of this.vertices) {
            const { x, y } = vertex;
            vertex.x = x * cosAngle - y * sinAngle + center.x;
            vertex.y = x * sinAngle + y * cosAngle + center.y;
        }
    }
}