export class CalculatedProperty<T> {
    private lastValue: T|undefined;
    private requiresRefresh: boolean;
    private refreshFunc: (property: CalculatedProperty<T>) => T;

    constructor(refreshFunc: () => T, initialValue?: T) {
        this.lastValue = initialValue;
        this.requiresRefresh = arguments.length < 2;
        this.refreshFunc = refreshFunc;
    }

    get value(): T {
        if (this.requiresRefresh) {
            const value: T = this.refreshFunc(this);

            if (this.requiresRefresh) {
                // Save the value returned by the callback
                this.lastValue = value;
                this.requiresRefresh = false;
            } else {
                // The update function called "updateValue" - ignore the result of the callback.
                // This allows an update function to refresh multiple CalculatedProperty's at once.
            }
        }

        return this.lastValue!;
    }

    markStale(): void {
        this.requiresRefresh = true;
    }

    updateValue(value: T): void {
        this.lastValue = value;
        this.requiresRefresh = false;
    }
}