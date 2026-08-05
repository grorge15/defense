/**
 * 标准单例基类模板。子类通过 getInstance() 获取唯一实例。
 */
export abstract class Singleton {
    private static _instances: Map<Function, Singleton> = new Map();

    protected constructor() {}

    public static getInstance<T extends Singleton>(this: new () => T): T {
        const ctor = this as unknown as Function;
        if (!Singleton._instances.has(ctor)) {
            Singleton._instances.set(ctor, new this());
        }
        return Singleton._instances.get(ctor) as T;
    }

    public static clearInstance<T extends Singleton>(this: new () => T): void {
        Singleton._instances.delete(this as unknown as Function);
    }
}
