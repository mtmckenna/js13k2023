import Enemy from "./enemy";
import Road from "./road";
export interface IPoint {
    x: number;
    y: number;
}

export interface IPoolPoint extends IPoint {
    active: boolean;
}
export interface IEdge {
    v0: IPoint;
    v1: IPoint;
    color?: CanvasColor;
}

export interface IPoolEdge extends IEdge {
    active: boolean;
}

export interface ICircle {
    center: IPoint;
    radius: number;
}

export interface IIntersection {
    point: IPoint;
    edge1: number;
    edge2: number;
}

export interface ITriangle extends IPolygon {
    vertices: IVertices3;
}

export interface IPolygon {
    vertices: IPoint[];
    center: IPoint;
    color?: CanvasColor;
}

export type CanvasColor = string | CanvasGradient | CanvasPattern;

export interface IBuilding extends IPolygon {
    type: "empty" | "depot" | "delivery";
    dropOffPoint: IPoint;
}
export interface IVoronoiResult {
    edges: IEdge[];
    polygons: IPolygon[];
}
export interface ITriangleInTriangulation extends ITriangle {
    circumcircle: ICircle;
    neighbors: ITriangleInTriangulation[];
}
export interface IGameObject {
    pos: IPoint;
    angle: number;
    size: IPoint;
    color: CanvasColor;
    center: IPoint;
    occupiedCells: IGridCell[];
    numOccupiedCells: number;
    vertices: IPoint[];
}


export interface ICollision {
    depth: number;
    edge: IEdge;
}

export interface IGridCell {
    index: number;
    cost: number;
    enemies: Enemy[];
    roads: Road[];
    numEnemies: number;
    numRoads: number;
}

export interface IKeyboardInputState {
    left: number;
    right: number;
    up: number;
    down: number;
}

export interface IInputState {
    pos: IPoint;
    pressed: boolean;
    doubleTapped: boolean;
}

export interface IVehicleInputState {
    mode: "kb" | "js";
    pos: IPoint;
}

export interface IRectangle extends IPolygon {
    vertices: IVertices4;
}

export interface IVertices4 extends Array<IPoint> {
    0: IPoint;
    1: IPoint;
    2: IPoint;
    3: IPoint;
    length: 4;
}

export interface IVertices3 extends Array<IPoint> {
    0: IPoint;
    1: IPoint;
    2: IPoint;
    length: 3;
}

export interface ISubdividedRegion {
    regions: IPolygon[];
    obb: IOrientedBoundingBox;
    edges: IEdge[];
}

export interface IOrientedBoundingBox {
    angle: number;
    width: number;
    height: number;
    center: IPoint;
    vertices: IPoint[];
    color?: CanvasColor;
}

export interface IBoundingBox {
    min:IPoint;
    max:IPoint;
    width: number;
    height: number;
    center: IPoint;
}

export interface IRegion extends IPolygon {
    edges: IEdge[];
    insideEdges: IEdge[];
    unclippedEdges: IEdge[];
    polygonEdges: IEdge[];
}

export interface ILine {
    p: IPoint; // a point on the line
    v: IVector; // direction vector of the line
}

export type IVector = IPoint;