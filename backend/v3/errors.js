export class V3Error extends Error {
    constructor(code, status = 422) { super(code); this.code = code; this.status = status; }
}
