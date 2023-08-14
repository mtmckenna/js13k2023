import {CanvasColor, IEdge, IGridCell, IPoint, IPolygon, IPositionable} from "./interfaces";
import Enemy from "./enemy";
import Road from "./road";

import { DEBUG } from "./debug";

const GRID_CELL_SIZE = 10;
const GRID_SIZE_X = 250;
const GRID_SIZE_Y = 250;
export const GAME_WIDTH = GRID_CELL_SIZE * GRID_SIZE_X;
export const GAME_HEIGHT = GRID_CELL_SIZE * GRID_SIZE_Y;


const MAX_ROADS_PER_CELL = 10;
const MAX_ENEMIES_PER_CELL = 10;

const OFFSETS = [
    { x: -1, y: 0 }, // Left
    { x: 1, y: 0 },  // Right
    { x: 0, y: -1 }, // Top
    { x: 0, y: 1 }   // Bottom
];

export default class Grid {
    cells: Array<IGridCell> = [];
    cellSize: IPoint = {x: GRID_CELL_SIZE, y: GRID_CELL_SIZE};
    gameSize: IPoint = {x: GAME_WIDTH, y: GAME_HEIGHT};
    gridSize: IPoint = {x: GRID_SIZE_X, y: GRID_SIZE_Y};
    roads: Road[] = [];
    edges: IEdge[] = [];
    subregionPolygons: IPolygon[] = [];
    buildings: IPolygon[] = [];
    regions: IPolygon[] = [];

    constructor() {
        // have to fill with undefined to chain with map
        for (let i = 0; i < this.gridSize.x * this.gridSize.y; i++) {
            this.cells.push({
                index: i,
                enemies: new Array(MAX_ENEMIES_PER_CELL).fill(null),
                numEnemies: 0,
                roads: new Array(MAX_ROADS_PER_CELL).fill(null),
                numRoads: 0,
                cost: 0}
            );
        }
    }

    update() {
        this.clearEnemyMap();
    }

    setRoads(roads: Road[]) {
        this.roads = roads;

        // empty the cells of roads
        for (const cell of this.cells) {
            cell.numRoads = 0;
        }

        // go through the roads and get the number of cells each road occupies
        // then go through the cells and add the road to the cell's road array
        for (let i = 0; i < roads.length; i++) {
            const road = roads[i];
            const numCells = this.occupiedCells(road, road.occupiedCells);
            road.numOccupiedCells = numCells;
            for (let j = 0; j < numCells; j++) {
                const cell = road.occupiedCells[j];
                cell.roads[cell.numRoads] = road;
                cell.numRoads++;
            }
        }

        this.edges = [];
        for (const road of roads) {
            this.edges.push(road.edge);
        }
    }

    setBuildings(buildings: IPolygon[]) {
        this.buildings = buildings;
    }

    setRegions(regions: IPolygon[]) {
        this.regions = regions;
    }

    setSubregionPolygons(subregionPolygons: IPolygon[]) {
        this.subregionPolygons = subregionPolygons;
    }
    draw(ctx: CanvasRenderingContext2D, scale: number = 1) {
        ctx.imageSmoothingEnabled = false;

        for (const road of this.roads) {
            road.draw(ctx, scale);
        }

        // for (const region of this.subregionPolygons) {
        //     // random color fill
        //     ctx.fillStyle = region.color;
        //     ctx.beginPath();
        //     ctx.moveTo(region.vertices[0].x*scale, region.vertices[0].y*scale);
        //     for (let i = 1; i < region.vertices.length; i++) {
        //         const vertex = region.vertices[i];
        //         ctx.lineTo(vertex.x*scale, vertex.y*scale);
        //     }
        //
        //     ctx.fill();
        //     ctx.closePath();
        // }

        if (DEBUG) {
            ctx.globalAlpha = 1;
        }
    }


    // #699169
    drawRegions(ctx: CanvasRenderingContext2D, scale: number = 1) {
        ctx.imageSmoothingEnabled = false;

        for (const region of this.regions) {
            ctx.fillStyle = "#699169";
            ctx.beginPath();
            ctx.moveTo(region.vertices[0].x*scale, region.vertices[0].y*scale);
            for (let i = 1; i < region.vertices.length; i++) {
                const vertex = region.vertices[i];
                ctx.lineTo(vertex.x*scale, vertex.y*scale);
            }

            ctx.fill();
            ctx.closePath();
        }
    }

    drawBuildings(ctx: CanvasRenderingContext2D, scale: number = 1) {
        for (const b of this.buildings) {
            this.drawBuilding(ctx, b, scale);
        }
    }

    drawBuilding(ctx: CanvasRenderingContext2D, building: IPolygon, scale: number = 1, color: CanvasColor = "#fff") {
        ctx.imageSmoothingEnabled = false;
        ctx.lineWidth = 5;
        ctx.fillStyle = "gray";
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(building.vertices[0].x*scale, building.vertices[0].y*scale);
        for (let i = 1; i < building.vertices.length; i++) {
            const vertex = building.vertices[i];
            ctx.lineTo(vertex.x*scale, vertex.y*scale);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    getNeighbors(currentIndex: number, neighborGridCells: IGridCell[]): Array<IGridCell> {
        // const neighbors: Array<IGridCell> = [];
        const { cells } = this;
        const width = this.gridSize.x;
        const height = this.gridSize.y;

        const x = currentIndex % width;
        const y = Math.floor(currentIndex / width);

        // Iterate over the offsets and calculate the neighbor coordinates
        for (let i = 0; i < OFFSETS.length; i++) {
            const offset = OFFSETS[i]
            const neighborX = x + offset.x;
            const neighborY = y + offset.y;

            // Check if the neighbor coordinates are within the grid bounds
            if (neighborX >= 0 && neighborX < width && neighborY >= 0 && neighborY < height) {
                const neighborIndex = neighborX + neighborY * width;
                // neighborGridCells.push(cells[neighborIndex]);
                neighborGridCells[i] = cells[neighborIndex];
            }


        }

        return neighborGridCells;
    }

    indexForPos(x: number, y: number): number {
        const x2 = this.cellCoordinateForXPos(x);
        const y2 = this.cellCoordinateForYPos(y);
        return(this.indexForCellCoordinates(x2,y2));
    }

    cellCoordinateForXPos(x: number): number {
        return Math.floor(x / this.cellSize.x);
    }

    cellCoordinateForYPos(y: number): number {
        return Math.floor(y / this.cellSize.y);
    }

    indexForCellCoordinates(x: number, y:number): number {
        return x + y * this.gridSize.x;
    }

    addToEnemyMap(enemy: Enemy) {
        // this.cells[enemy.index].enemies.push(enemy);
        const cell = this.cells[enemy.index];
        const numEnemies = cell.numEnemies;
        cell.enemies[numEnemies] = enemy;
        cell.numEnemies++;
    }

    clearEnemyMap() {
        for (const cell of this.cells) {
            for (let j = 0; j < cell.numEnemies; j++) {
                cell.enemies[j] = null;
            }
            cell.numEnemies = 0;
        }
    }

    occupiedCells(gameObject: IPositionable, occupiedCells: IGridCell[]): number {
        const { center, size, angle } = gameObject;
        const { cellSize, gridSize } = this;

        let i = 0;

        //Rasterize the object to determine the occupied cells
        // to do: use a fixed length array and keep track of the length
        for (let cellY = 0; cellY < gridSize.y; cellY++) {
            for (let cellX = 0; cellX < gridSize.x; cellX++) {
                const cellCenterX = cellX * cellSize.x + cellSize.x / 2;
                const cellCenterY = cellY * cellSize.y + cellSize.y / 2;

                // Check if the cell center is within the rotated object
                if (this.isPointInRotatedObject(cellCenterX, cellCenterY, center.x, center.y, size.x, size.y, angle)) {
                    const cellIndex = cellX + cellY * gridSize.x;

                    // warn if we're going to overflow the array
                    if (i >= occupiedCells.length) {
                        console.warn(`occupiedCells array overflow: ${occupiedCells.length} ${i}`);
                        break;
                    }

                    occupiedCells[i] = this.cells[cellIndex];
                    i++;
                }
            }
        }

        for (let j = i; j < occupiedCells.length; j++) {
            occupiedCells[j] = null;
        }

        return i;
    }

    isPointInRotatedObject(pointX: number, pointY: number, middleXPos: number, middleYPos: number, sizeX: number, sizeY: number, angle: number): boolean {
        const halfWidth = sizeX / 2;
        const halfHeight = sizeY / 2;

        // Transform the point to the object's local coordinate system
        const transformedX = pointX - middleXPos;
        const transformedY = pointY - middleYPos;

        const distanceSquared = (transformedX * transformedX) + (transformedY * transformedY);
        if (distanceSquared > (Math.max(halfWidth, halfHeight) * Math.max(halfWidth, halfHeight))) {
            return false;
        }

        // const cosAngle = Math.cos(angle);
        // const sinAngle = Math.sin(angle);

        const { cos: cosAngle, sin: sinAngle } = getTrigValues(Math.round(angle));

        // Apply the inverse rotation to the transformed point
        const rotatedX = transformedX * cosAngle + transformedY * sinAngle;
        const rotatedY = -transformedX * sinAngle + transformedY * cosAngle;

        // Check if the rotated point is within the object's bounding box
        return (
            rotatedX >= -halfWidth &&
            rotatedX <= halfWidth &&
            rotatedY >= -halfHeight &&
            rotatedY <= halfHeight
        );
    }
}


const trigCache = {};

function getTrigValues(angle) {
    if (!trigCache[angle]) {
        trigCache[angle] = {
            cos: Math.cos(angle),
            sin: Math.sin(angle)
        };
    }
    return trigCache[angle];
}