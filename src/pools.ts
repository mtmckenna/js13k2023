import {IEdge, IPoint, IPoolPoint, IPoolEdge} from "./interfaces";


export class PointPool {
    private static available: IPoolPoint[] = [];

    static initialize(count: number): void {
        for (let i = 0; i < count; i++) {
            PointPool.available.push({x: 0, y: 0, active: false});
        }
    }

    static get(x: number = 0, y: number = 0): IPoolPoint {
        for (let i = 0; i < PointPool.available.length; i++) {
            const point = PointPool.available[i];
            if (!point.active) {
                point.x = x;
                point.y = y;
                point.active = true;
                return point;
            }
        }

        const point = {x, y, active: true};
        PointPool.available.push(point);
        console.warn("PointPool ran out of points.");
        return point;
    }

    static release(point: IPoolPoint) {
        point.x = 0;
        point.y = 0;
        point.active = false;
    }
}

PointPool.initialize(1000);
