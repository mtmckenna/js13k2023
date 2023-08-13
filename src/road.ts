import {IPoint, IEdge, IGameObject, IGridCell} from "./interfaces";
import Block from "./block";

export const ROAD_WIDTH = 100;
export default class Road extends Block {

    originalRoadColor = "#474747";
    edge: IEdge;
    color: string;
    angle: number;
    size: IPoint;
    pos: IPoint;
    center: IPoint;
    constructor(edge: IEdge, boundingBox: IPoint) {
        super();
        this.originalRoadColor = "#3469bf";
        this.color = this.originalRoadColor;
        this.edge = edge;
        this.size = {x: ROAD_WIDTH, y: 0};
        this.angle = Math.atan2(edge.v1.y - edge.v0.y, edge.v1.x - edge.v0.x) + Math.PI / 2;
        this.extendToMeetBoundingBox(boundingBox);
        const pos = posFromEdge(this.edge);
        this.updatePos(pos.x, pos.y);
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
        this.updatePos(pos.x, pos.y);
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