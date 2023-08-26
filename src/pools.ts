import {IPoint, IPoolPoint} from "./interfaces";
import {Bullet} from "./bullet";
import {updatePos} from "./game_objects";
import Grid from "./grid";


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

export class BulletPool {
    public static available: Bullet[] = [];
    public static gameSize: IPoint = {x: 0, y: 0};
    public static grid: Grid;

    static initialize(count: number): void {
        for (let i = 0; i < count; i++) {
            BulletPool.available.push(new Bullet());
        }
    }

    static get(x: number, y: number): Bullet | null {
        if (!BulletPool.grid) return null;
        for (let i = 0; i < BulletPool.available.length; i++) {
            const bullet = BulletPool.available[i];
            if (!bullet.active) {
                bullet.active = true;
                updatePos(x, y, bullet);
                return bullet;
            }
        }

        const bullet = new Bullet();
        updatePos(x, y, bullet);
        BulletPool.available.push(bullet);
        console.warn("out of bullets.");
        return bullet;
    }

    static update(t: number) {
        // update bullets and deactivate them if they are out of bounds and reset their lifeTime and set them to inactive
        for (let i = 0; i < BulletPool.available.length; i++) {
            const bullet = BulletPool.available[i];
            if (bullet.active) {
                bullet.update(t);
            }

            if (bullet.pos.x < 0 || bullet.pos.x > BulletPool.gameSize.x|| bullet.pos.y < 0 || bullet.pos.y > BulletPool.gameSize.y || bullet.lifeTime > bullet.maxLifeTime) {
                BulletPool.release(bullet);
            }

        }
    }

    static draw(ctx: CanvasRenderingContext2D, scale: number = 1) {
        for (let i = 0; i < BulletPool.available.length; i++) {
            const bullet = BulletPool.available[i];
            if (bullet.active) {
                ctx.save();
                ctx.translate(bullet.center.x * scale, bullet.center.y * scale);
                ctx.rotate(bullet.angle);
                ctx.imageSmoothingEnabled = false;  // Ensure no smoothing for main canvas

                // draw bullet which is a square that rotates based on the bullets angle
                ctx.fillStyle = "#000";
                ctx.fillRect(-bullet.size.x*scale, -bullet.size.y*scale, bullet.size.x*scale, bullet.size.y*scale);

                ctx.restore();
            }
        }
    }

    static release(bullet: Bullet) {
        bullet.active = false;
        bullet.lifeTime = 0;
    }
}