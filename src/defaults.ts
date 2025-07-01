const DEFAULT_VS_SHADER = `
    attribute vec4 v_position;

    void main() {
        gl_Position = v_position;
    }     
`;

const DEFAULT_FS_SHADER = `
    precision highp float;
    uniform vec2 u_resolution;

    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        gl_FragColor = vec4(uv.x, uv.y, 0., 1.);
    }
`;

export { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER };
