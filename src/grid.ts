import {CanvasColor, IEdge, IGridCell, IPoint, IPolygon, IPositionable} from "./interfaces";
import Enemy from "./enemy";
import Road from "./road";

import { DEBUG } from "./debug";
import {getCos, getSin, squaredDistance} from "./math";

export const GRID_CELL_SIZE = 300;
export const GRID_SIZE_X = 10;
const GRID_SIZE_Y = 10;
export const GAME_WIDTH = GRID_CELL_SIZE * GRID_SIZE_X;
export const GAME_HEIGHT = GRID_CELL_SIZE * GRID_SIZE_Y;


const MAX_ROADS_PER_CELL = 10;
const MAX_ENEMIES_PER_CELL = 10;

const neighbors: IGridCell[] = [];


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

    getEnemiesFromNeighborsLoopingNTimes(pos: IPoint, n: number, enemies: Enemy[]): Enemy[] {
        neighbors.length = 0; // TODO: make this a fixed length array
        // TODO: don't allocate memory
        const startCellIndex = indexForPos(pos.x, pos.y, GRID_SIZE_X);
        const visited: { [index: number]: boolean } = {};
        const queue: number[] = [startCellIndex];

        while (queue.length > 0 && n > 0) {
            const currentCellIndex = queue.shift()!;
            visited[currentCellIndex] = true;

            const currentCell = this.cells[currentCellIndex];

            // Check if there's an enemy in this cell.
            for (let i = 0; i < currentCell.numEnemies; i++) {
                const enemy = currentCell.enemies[i];
                if (enemy && i < enemies.length - 1) {
                    enemies[i] = enemy;
                    // enemies.push(enemy);
                }
            }

            this.setNeighborGridCells(currentCellIndex, neighbors);
            for (const neighbor of neighbors) {
                if (neighbor && !visited[neighbor.index]) {
                    queue.push(neighbor.index);
                }
            }
            // Add neighboring cells to the queue if they haven't been visited.
            // queue.push(...this.getNeighborGridCells(currentCellIndex, visited));

        }

        return enemies;
    }

    getNearestEnemy(pos: IPoint): Enemy | null {
        neighbors.length = 0;
        // TODO: don't allocate memory
        const startCellIndex = indexForPos(pos.x, pos.y, GRID_SIZE_X);
        const visited: { [index: number]: boolean } = {};
        const queue: number[] = [startCellIndex];

        let tries = 0;
        let minDistance = Number.MAX_VALUE;
        let minEnemy: Enemy | null = null;

        while (queue.length > 0 && tries < 3) {
            const currentCellIndex = queue.shift()!;
            visited[currentCellIndex] = true;

            const currentCell = this.cells[currentCellIndex];


            // Check if there's an enemy in this cell.
            for (let i = 0; i < currentCell.numEnemies; i++) {
                const enemy = currentCell.enemies[i];
                if (enemy) {
                    // const distance = Math.hypot((pos.x - enemy.center.x), (pos.y - enemy.center.y));
                    const distance = squaredDistance(pos, enemy.center);
                    if (distance < minDistance) {
                        minDistance = distance;
                        minEnemy = enemy;
                        // return enemy;
                    }
                }
                // if (enemy) {
                //     return enemy; // Found an enemy, return it.
                // }
            }
            // Add neighboring cells to the queue if they haven't been visited.
            // TODO: don't allocate memory
            // const neighbors: IGridCell[] = [];
            this.setNeighborGridCells(currentCellIndex, neighbors);
            for (const neighbor of neighbors) {
                if (neighbor && !visited[neighbor.index]) {
                    queue.push(neighbor.index);
                }
            }

            tries++;
        }

        return minEnemy;
    }



    draw(ctx: CanvasRenderingContext2D, scale: number = 1) {
        ctx.imageSmoothingEnabled = false;

        // draw cells
        if (DEBUG) {
            ctx.globalAlpha = .5;
            let color = "red";
            for (let i = 0; i < this.cells.length; i++) {
                const cell = this.cells[i];
                // make checkboard pattern
                const row = Math.floor(i / this.gridSize.x) % 2 === 0;
                if (row) {
                    color = i % 2 === 0 ? "red" : "blue";
                } else {
                    color = i % 2 === 0 ? "blue" : "red";
                }

                ctx.fillStyle = color;
                ctx.fillRect(cell.index % this.gridSize.x * this.cellSize.x * scale, Math.floor(cell.index / this.gridSize.x) * this.cellSize.y * scale, this.cellSize.x * scale, this.cellSize.y * scale);
            }
        }

        for (const road of this.roads) {
            road.draw(ctx, scale);
        }

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
        ctx.fillStyle = "#654321";
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
        // ctx.stroke();
    }
    setNeighborGridCells(currentIndex: number, neighborGridCells: IGridCell[]): Array<IGridCell> {
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

    addToEnemyMap(enemy: Enemy) {
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

        // const { cos: cosAngle, sin: sinAngle } = getTrigValues(angle);
        const cosAngle = getCos(angle);
        const sinAngle = getSin(angle);

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

export function indexForPos(x: number, y: number, gridSizeX: number): number {
    const x2 =  Math.floor(x / GRID_CELL_SIZE);
    const y2 =  Math.floor(y / GRID_CELL_SIZE);
    return x2 + y2 * gridSizeX;
}