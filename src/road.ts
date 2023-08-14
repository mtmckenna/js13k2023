import {IPoint, IEdge, IGridCell, IPositionable} from "./interfaces";
import {updatePos} from "./game_objects";

export const ROAD_WIDTH = 100;
export default class Road implements IPositionable {
    originalRoadColor = "#474747";
    edge: IEdge;
    color: string;
    angle: number;
    size: IPoint = {x: ROAD_WIDTH, y: 0};
    pos: IPoint = {x: 0, y: 0};
    center: IPoint = {x: 0, y: 0};
    occupiedCells: IGridCell[] = new Array(2000).fill(null);
    numOccupiedCells: number = 0;
    vertices: IPoint[] = [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x:0, y: 0}];
    constructor(edge: IEdge, boundingBox: IPoint) {
        this.originalRoadColor = "#3469bf";
        this.color = this.originalRoadColor;
        this.edge = edge;
        this.size = {x: ROAD_WIDTH, y: 0};
        this.angle = Math.atan2(edge.v1.y - edge.v0.y, edge.v1.x - edge.v0.x) + Math.PI / 2;
        this.extendToMeetBoundingBox(boundingBox);
        const pos = posFromEdge(this.edge);
        updatePos(pos.x, pos.y, this);
    }

    // Make sure the road extends past the edge of the bounding box
    extendToMeetBoundingBox(boundingBox: IPoint) {
        const v0 = {...(this.edge.v0)};
        const v1 = {...(this.edge.v1)};

        const points = [v0, v1];

        // extend past the edge of the bounding box if the vertex is close to the edge
        for (let i = 0; i < points.length; i++) {
            const v = points[i];
            const otherV = points[(i + 1) % 2];

            const angle = Math.atan2(v.y - otherV.y, v.x - otherV.x);
            const xExtend = Math.cos(angle) * this.size.x;
            const yExtend = Math.sin(angle) * this.size.x;

            if (v.x <= Number.EPSILON || v.y <= Number.EPSILON || v.x >= boundingBox.x - Number.EPSILON || v.y >= boundingBox.y - Number.EPSILON) {
                v.x += xExtend;
                v.y += yExtend;
            }
        };

        this.edge.v0 = v0;
        this.edge.v1 = v1;
        this.size.y = Math.hypot(v0.x - v1.x, v0.y - v1.y);
        const pos = posFromEdge(this.edge);
        updatePos(pos.x, pos.y, this);
    }

    draw(ctx: CanvasRenderingContext2D, scale: number = 1) {
        ctx.save();
        ctx.translate(this.center.x*scale, this.center.y*scale);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size.x/2*scale, -this.size.y/2*scale, this.size.x*scale, this.size.y*scale);
        ctx.restore();
    }
}

function posFromEdge(edge: IEdge): IPoint {
    const dx = edge.v1.x - edge.v0.x;
    const dy = edge.v1.y - edge.v0.y;
    const height = Math.hypot(dx, dy);
    const middlePos = { x: edge.v0.x + dx / 2, y: edge.v0.y + dy / 2 };
    const pos = { x: middlePos.x - ROAD_WIDTH / 2, y: middlePos.y - height / 2 };
    return pos;
}