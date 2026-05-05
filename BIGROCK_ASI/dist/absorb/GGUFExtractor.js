import fs from 'fs';
/**
 * BIGROCK_v1 — GGUF Binary Extractor
 * ─────────────────────────────────────────────────────────────────────────
 * Reads GGUF model files at the BINARY level.
 * No external libraries — raw Buffer parsing of the GGUF specification.
 *
 * This is how Bigrock truly "eats" a model:
 *   1. Parse GGUF header (magic, version, tensor count, metadata count)
 *   2. Read ALL metadata key-value pairs (architecture, vocab, dimensions)
 *   3. Read ALL tensor descriptors (name, shape, type, offset)
 *   4. Dequantize key tensors (embedding matrix, output projection)
 *   5. Compute layer-level weight statistics for attention/FFN layers
 *
 * Supported quantization formats: F32, F16, Q4_0, Q8_0
 */
// ─── GGML Value Types ──────────────────────────────────────────────────────
var GGUFValueType;
(function (GGUFValueType) {
    GGUFValueType[GGUFValueType["UINT8"] = 0] = "UINT8";
    GGUFValueType[GGUFValueType["INT8"] = 1] = "INT8";
    GGUFValueType[GGUFValueType["UINT16"] = 2] = "UINT16";
    GGUFValueType[GGUFValueType["INT16"] = 3] = "INT16";
    GGUFValueType[GGUFValueType["UINT32"] = 4] = "UINT32";
    GGUFValueType[GGUFValueType["INT32"] = 5] = "INT32";
    GGUFValueType[GGUFValueType["FLOAT32"] = 6] = "FLOAT32";
    GGUFValueType[GGUFValueType["BOOL"] = 7] = "BOOL";
    GGUFValueType[GGUFValueType["STRING"] = 8] = "STRING";
    GGUFValueType[GGUFValueType["ARRAY"] = 9] = "ARRAY";
    GGUFValueType[GGUFValueType["UINT64"] = 10] = "UINT64";
    GGUFValueType[GGUFValueType["INT64"] = 11] = "INT64";
    GGUFValueType[GGUFValueType["FLOAT64"] = 12] = "FLOAT64";
})(GGUFValueType || (GGUFValueType = {}));
var GGMLType;
(function (GGMLType) {
    GGMLType[GGMLType["F32"] = 0] = "F32";
    GGMLType[GGMLType["F16"] = 1] = "F16";
    GGMLType[GGMLType["Q4_0"] = 2] = "Q4_0";
    GGMLType[GGMLType["Q4_1"] = 3] = "Q4_1";
    GGMLType[GGMLType["Q5_0"] = 6] = "Q5_0";
    GGMLType[GGMLType["Q5_1"] = 7] = "Q5_1";
    GGMLType[GGMLType["Q8_0"] = 8] = "Q8_0";
    GGMLType[GGMLType["Q8_1"] = 9] = "Q8_1";
    GGMLType[GGMLType["Q2_K"] = 10] = "Q2_K";
    GGMLType[GGMLType["Q3_K_S"] = 11] = "Q3_K_S";
    GGMLType[GGMLType["Q3_K_M"] = 12] = "Q3_K_M";
    GGMLType[GGMLType["Q3_K_L"] = 13] = "Q3_K_L";
    GGMLType[GGMLType["Q4_K_S"] = 14] = "Q4_K_S";
    GGMLType[GGMLType["Q4_K_M"] = 15] = "Q4_K_M";
    GGMLType[GGMLType["Q5_K_S"] = 16] = "Q5_K_S";
    GGMLType[GGMLType["Q5_K_M"] = 17] = "Q5_K_M";
    GGMLType[GGMLType["Q6_K"] = 18] = "Q6_K";
    GGMLType[GGMLType["Q8_K"] = 19] = "Q8_K";
    GGMLType[GGMLType["I8"] = 28] = "I8";
    GGMLType[GGMLType["I16"] = 29] = "I16";
    GGMLType[GGMLType["I32"] = 30] = "I32";
    GGMLType[GGMLType["I64"] = 31] = "I64";
    GGMLType[GGMLType["F64"] = 32] = "F64";
})(GGMLType || (GGMLType = {}));
const GGML_TYPE_NAMES = {
    0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1',
    6: 'Q5_0', 7: 'Q5_1', 8: 'Q8_0', 9: 'Q8_1',
    10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M', 13: 'Q3_K_L',
    14: 'Q4_K_S', 15: 'Q4_K_M', 16: 'Q5_K_S', 17: 'Q5_K_M',
    18: 'Q6_K', 19: 'Q8_K',
};
// Block sizes per quantization type (number of values per block)
const BLOCK_SIZE = {
    [GGMLType.F32]: 1, [GGMLType.F16]: 1,
    [GGMLType.Q4_0]: 32, [GGMLType.Q4_1]: 32,
    [GGMLType.Q5_0]: 32, [GGMLType.Q5_1]: 32,
    [GGMLType.Q8_0]: 32, [GGMLType.Q8_1]: 32,
    [GGMLType.Q4_K_S]: 256, [GGMLType.Q4_K_M]: 256,
    [GGMLType.Q5_K_S]: 256, [GGMLType.Q5_K_M]: 256,
    [GGMLType.Q6_K]: 256, [GGMLType.Q2_K]: 256,
    [GGMLType.Q3_K_S]: 256, [GGMLType.Q3_K_M]: 256, [GGMLType.Q3_K_L]: 256,
};
// Bytes per block for each quantization type
const BYTES_PER_BLOCK = {
    [GGMLType.F32]: 4, [GGMLType.F16]: 2,
    [GGMLType.Q4_0]: 18, // 2 (fp16 scale) + 16 (32 x 4-bit nibbles)
    [GGMLType.Q4_1]: 20, // 2 (fp16 scale) + 2 (fp16 min) + 16 nibbles
    [GGMLType.Q8_0]: 34, // 2 (fp16 scale) + 32 (32 x int8)
    [GGMLType.Q4_K_S]: 144,
    [GGMLType.Q4_K_M]: 144,
    [GGMLType.Q5_K_S]: 176,
    [GGMLType.Q5_K_M]: 176,
    [GGMLType.Q6_K]: 210,
    [GGMLType.Q2_K]: 84,
    [GGMLType.Q3_K_S]: 110,
    [GGMLType.Q3_K_M]: 110,
    [GGMLType.Q3_K_L]: 110,
};
// ─── GGUF Extractor Class ──────────────────────────────────────────────────
export class GGUFExtractor {
    filepath;
    fd = -1;
    file_size = 0;
    constructor(filepath) {
        this.filepath = filepath;
    }
    /**
     * PHASE 1: Parse GGUF header + metadata + tensor info (no tensor data yet).
     * This reads the file structure without loading huge weight matrices.
     */
    parseStructure() {
        const fd = fs.openSync(this.filepath, 'r');
        this.fd = fd;
        this.file_size = fs.fstatSync(fd).size;
        let offset = 0;
        // ── Magic number: "GGUF" ──
        const magic_buf = Buffer.alloc(4);
        fs.readSync(fd, magic_buf, 0, 4, offset);
        offset += 4;
        const magic = magic_buf.toString('ascii');
        if (magic !== 'GGUF') {
            fs.closeSync(fd);
            throw new Error(`Invalid GGUF file: magic = "${magic}" (expected "GGUF")`);
        }
        // ── Version ──
        const version = this.readUint32(fd, offset);
        offset += 4;
        console.log(`[GGUFExtractor]: GGUF v${version} | File size: ${(this.file_size / 1e9).toFixed(2)} GB`);
        // ── Tensor count & metadata count ──
        const n_tensors = this.readUint64AsNumber(fd, offset);
        offset += 8;
        const n_metadata = this.readUint64AsNumber(fd, offset);
        offset += 8;
        console.log(`[GGUFExtractor]: ${n_tensors} tensors | ${n_metadata} metadata entries`);
        // ── Read metadata ──
        const metadata = {};
        for (let i = 0; i < n_metadata; i++) {
            const { key, value, new_offset } = this.readMetadataKV(fd, offset);
            metadata[key] = value;
            offset = new_offset;
        }
        // ── Read tensor descriptions ──
        const tensors = [];
        for (let i = 0; i < n_tensors; i++) {
            const { tensor, new_offset } = this.readTensorInfo(fd, offset);
            tensors.push(tensor);
            offset = new_offset;
        }
        // Tensor data starts after alignment
        const ALIGNMENT = metadata['general.alignment'] || 32;
        const tensor_data_offset = Math.ceil(offset / ALIGNMENT) * ALIGNMENT;
        // Extract architecture info from metadata
        const arch = metadata['general.architecture'] || 'unknown';
        const vocab_size = metadata[`${arch}.vocab_size`] || metadata['tokenizer.ggml.tokens']?.length || 0;
        const embedding_dim = metadata[`${arch}.embedding_length`] || 0;
        const n_layers = metadata[`${arch}.block_count`] || 0;
        const n_heads = metadata[`${arch}.attention.head_count`] || 0;
        const context_length = metadata[`${arch}.context_length`] || 0;
        fs.closeSync(fd);
        this.fd = -1;
        return {
            version, n_tensors, n_metadata, metadata, tensors,
            tensor_data_offset, architecture: arch,
            vocab_size, embedding_dim, n_layers, n_heads, context_length,
        };
    }
    /**
     * PHASE 2: Extract a specific tensor by name — read raw bytes and dequantize to Float32.
     */
    extractTensor(parsed, tensor_name, max_elements) {
        const info = parsed.tensors.find(t => t.name === tensor_name);
        if (!info) {
            console.log(`[GGUFExtractor]: Tensor "${tensor_name}" not found.`);
            return null;
        }
        const fd = fs.openSync(this.filepath, 'r');
        try {
            const file_offset = parsed.tensor_data_offset + info.offset;
            const elements = max_elements ? Math.min(info.total_elements, max_elements) : info.total_elements;
            console.log(`[GGUFExtractor]: Extracting "${tensor_name}" [${info.shape.join('x')}] type=${GGML_TYPE_NAMES[info.type] || info.type} (${elements} elements)...`);
            const data = this.dequantizeTensor(fd, file_offset, info.type, elements);
            return {
                name: tensor_name,
                shape: info.shape,
                type: info.type,
                data,
            };
        }
        finally {
            fs.closeSync(fd);
        }
    }
    /**
     * PHASE 2b: Extract layer-level statistics without loading full tensor.
     * Reads a sample of the tensor and computes mean/std/norm.
     */
    extractTensorStats(parsed, tensor_name, sample_size = 4096) {
        const info = parsed.tensors.find(t => t.name === tensor_name);
        if (!info)
            return null;
        const fd = fs.openSync(this.filepath, 'r');
        try {
            const file_offset = parsed.tensor_data_offset + info.offset;
            const elements = Math.min(info.total_elements, sample_size);
            const data = this.dequantizeTensor(fd, file_offset, info.type, elements);
            let sum = 0, sq_sum = 0, min_v = Infinity, max_v = -Infinity;
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                sum += v;
                sq_sum += v * v;
                if (v < min_v)
                    min_v = v;
                if (v > max_v)
                    max_v = v;
            }
            const mean = sum / data.length;
            const variance = (sq_sum / data.length) - (mean * mean);
            const std = Math.sqrt(Math.max(0, variance));
            const l2_norm = Math.sqrt(sq_sum);
            // Parse layer index from tensor name
            const layer_match = tensor_name.match(/blk\.(\d+)/);
            const layer_index = layer_match ? parseInt(layer_match[1]) : -1;
            return {
                layer_index,
                tensor_name,
                mean, std, min: min_v, max: max_v, l2_norm,
                element_count: info.total_elements,
            };
        }
        finally {
            fs.closeSync(fd);
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  DEQUANTIZATION — Convert quantized weights to Float32
    // ═══════════════════════════════════════════════════════════════════════════
    dequantizeTensor(fd, file_offset, type, n_elements) {
        switch (type) {
            case GGMLType.F32:
                return this.readF32Tensor(fd, file_offset, n_elements);
            case GGMLType.F16:
                return this.readF16Tensor(fd, file_offset, n_elements);
            case GGMLType.Q4_0:
                return this.dequantizeQ4_0(fd, file_offset, n_elements);
            case GGMLType.Q8_0:
                return this.dequantizeQ8_0(fd, file_offset, n_elements);
            case GGMLType.Q4_K_M:
            case GGMLType.Q4_K_S:
                return this.dequantizeQ4_K(fd, file_offset, n_elements);
            case GGMLType.Q3_K_S:
            case GGMLType.Q3_K_M:
            case GGMLType.Q3_K_L:
                return this.dequantizeQ3_K(fd, file_offset, n_elements);
            case GGMLType.Q6_K:
                return this.dequantizeQ6_K(fd, file_offset, n_elements);
            default:
                // Strict Determinism Enforcement: No fictional math.random fallbacks.
                throw new Error(`[GGUFExtractor]: Unsupported quantization type ${GGML_TYPE_NAMES[type] || type}. Strict execution aborted to prevent fictional extraction.`);
        }
    }
    /** Read raw float32 tensor */
    readF32Tensor(fd, offset, n) {
        const buf = Buffer.alloc(n * 4);
        fs.readSync(fd, buf, 0, n * 4, offset);
        return new Float32Array(buf.buffer, buf.byteOffset, n);
    }
    /** Read float16 tensor and convert to float32 */
    readF16Tensor(fd, offset, n) {
        const buf = Buffer.alloc(n * 2);
        fs.readSync(fd, buf, 0, n * 2, offset);
        const result = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            result[i] = this.fp16ToFp32(buf.readUInt16LE(i * 2));
        }
        return result;
    }
    /**
     * Dequantize Q4_0 format.
     * Block structure: [fp16 scale (2 bytes)] [16 bytes of 32 x 4-bit quants]
     * Each 4-bit value represents (value - 8) * scale
     */
    dequantizeQ4_0(fd, offset, n_elements) {
        const BLOCK_VALUES = 32;
        const BLOCK_BYTES = 18; // 2 (fp16 scale) + 16 (nibbles)
        const n_blocks = Math.ceil(n_elements / BLOCK_VALUES);
        const raw = Buffer.alloc(n_blocks * BLOCK_BYTES);
        fs.readSync(fd, raw, 0, n_blocks * BLOCK_BYTES, offset);
        const result = new Float32Array(n_elements);
        let out_idx = 0;
        for (let b = 0; b < n_blocks && out_idx < n_elements; b++) {
            const block_offset = b * BLOCK_BYTES;
            const scale = this.fp16ToFp32(raw.readUInt16LE(block_offset));
            for (let j = 0; j < 16 && out_idx < n_elements; j++) {
                const byte = raw[block_offset + 2 + j];
                const lo = (byte & 0x0F); // lower nibble
                const hi = (byte >> 4) & 0x0F; // upper nibble
                result[out_idx++] = (lo - 8) * scale;
                if (out_idx < n_elements) {
                    result[out_idx++] = (hi - 8) * scale;
                }
            }
        }
        return result;
    }
    /**
     * Dequantize Q8_0 format.
     * Block: [fp16 scale (2 bytes)] [32 x int8 quants]
     */
    dequantizeQ8_0(fd, offset, n_elements) {
        const BLOCK_VALUES = 32;
        const BLOCK_BYTES = 34; // 2 + 32
        const n_blocks = Math.ceil(n_elements / BLOCK_VALUES);
        const raw = Buffer.alloc(n_blocks * BLOCK_BYTES);
        fs.readSync(fd, raw, 0, n_blocks * BLOCK_BYTES, offset);
        const result = new Float32Array(n_elements);
        let out_idx = 0;
        for (let b = 0; b < n_blocks && out_idx < n_elements; b++) {
            const block_offset = b * BLOCK_BYTES;
            const scale = this.fp16ToFp32(raw.readUInt16LE(block_offset));
            for (let j = 0; j < 32 && out_idx < n_elements; j++) {
                const q = raw.readInt8(block_offset + 2 + j);
                result[out_idx++] = q * scale;
            }
        }
        return result;
    }
    /**
     * Dequantize Q4_K format (K-quant, used in most modern GGUF files).
     * Super-block of 256 values = 8 sub-blocks of 32 values each.
     * Layout: [fp16 d (2)] [fp16 dmin (2)] [scales: 12 bytes] [quants: 128 bytes]
     * Total = 144 bytes per super-block.
     *
     * Scales layout (12 bytes = 8 x 6-bit scale + 8 x 6-bit min, packed):
     *   Bytes 0..3:  low 6 bits of scales[0..3] (in lower 6 bits of each byte)
     *   Bytes 4..7:  low 6 bits of scales[4..7]
     *   Bytes 8..9:  high 2 bits of scales[0..3], packed
     *   Bytes 10..11: high 2 bits of scales[4..7], packed
     *
     * For each sub-block j: value_i = d * sc_j * (q_i & 0xF) - dmin * m_j
     */
    dequantizeQ4_K(fd, offset, n_elements) {
        const BLOCK_VALUES = 256;
        const BLOCK_BYTES = 144;
        const n_blocks = Math.ceil(n_elements / BLOCK_VALUES);
        const max_bytes = Math.min(n_blocks * BLOCK_BYTES, 500 * 1024 * 1024);
        const raw = Buffer.alloc(max_bytes);
        const actual_blocks = Math.min(n_blocks, Math.floor(max_bytes / BLOCK_BYTES));
        fs.readSync(fd, raw, 0, actual_blocks * BLOCK_BYTES, offset);
        const actual_elements = Math.min(n_elements, actual_blocks * BLOCK_VALUES);
        const result = new Float32Array(actual_elements);
        let out_idx = 0;
        for (let b = 0; b < actual_blocks && out_idx < actual_elements; b++) {
            const bo = b * BLOCK_BYTES;
            const d = this.fp16ToFp32(raw.readUInt16LE(bo));
            const dmin = this.fp16ToFp32(raw.readUInt16LE(bo + 2));
            // Decode 8 sub-block scales and mins from 12 packed bytes
            const sc_bytes = bo + 4; // scales start at byte 4
            const scales = new Float32Array(8);
            const mins = new Float32Array(8);
            for (let j = 0; j < 8; j++) {
                // Low 6 bits come from bytes 0..7, alternating scale/min
                if (j < 4) {
                    scales[j] = raw[sc_bytes + j] & 0x3F;
                    mins[j] = raw[sc_bytes + j + 4] & 0x3F;
                }
                else {
                    scales[j] = raw[sc_bytes + j + 4] & 0x3F;
                    mins[j] = raw[sc_bytes + j + 4 + 4] & 0x3F;
                }
            }
            // Quant data: 128 bytes of 4-bit values starting at byte 16
            const qs = bo + 16;
            for (let j = 0; j < 128 && out_idx < actual_elements; j++) {
                const byte_val = raw[qs + j];
                const q_lo = byte_val & 0x0F;
                const q_hi = (byte_val >> 4) & 0x0F;
                // Determine which sub-block we're in
                const sub_lo = Math.floor((j * 2) / 32);
                const sub_hi = Math.floor((j * 2 + 1) / 32);
                const sc_lo = sub_lo < 8 ? scales[sub_lo] : 1;
                const sc_hi = sub_hi < 8 ? scales[sub_hi] : 1;
                const mn_lo = sub_lo < 8 ? mins[sub_lo] : 0;
                const mn_hi = sub_hi < 8 ? mins[sub_hi] : 0;
                result[out_idx++] = d * sc_lo * q_lo - dmin * mn_lo;
                if (out_idx < actual_elements) {
                    result[out_idx++] = d * sc_hi * q_hi - dmin * mn_hi;
                }
            }
        }
        return result;
    }
    /**
     * Dequantize Q3_K format (3-bit K-quant).
     * Block of 256 values = 110 bytes.
     * Layout: [hmask: 32 bytes] [qs: 64 bytes] [scales: 12 bytes] [fp16 d: 2 bytes]
     */
    dequantizeQ3_K(fd, offset, n_elements) {
        const BLOCK_VALUES = 256;
        const BLOCK_BYTES = 110;
        const n_blocks = Math.ceil(n_elements / BLOCK_VALUES);
        const max_bytes = Math.min(n_blocks * BLOCK_BYTES, 50 * 1024 * 1024);
        const raw = Buffer.alloc(max_bytes);
        const actual_blocks = Math.min(n_blocks, Math.floor(max_bytes / BLOCK_BYTES));
        fs.readSync(fd, raw, 0, actual_blocks * BLOCK_BYTES, offset);
        const actual_elements = Math.min(n_elements, actual_blocks * BLOCK_VALUES);
        const result = new Float32Array(actual_elements);
        let out_idx = 0;
        for (let b = 0; b < actual_blocks && out_idx < actual_elements; b++) {
            const bo = b * BLOCK_BYTES;
            const d = this.fp16ToFp32(raw.readUInt16LE(bo + 108));
            const qs_off = bo + 32;
            for (let j = 0; j < 64 && out_idx < actual_elements; j++) {
                const byte_val = raw[qs_off + j];
                for (let k = 0; k < 4 && out_idx < actual_elements; k++) {
                    const q2 = (byte_val >> (k * 2)) & 0x03;
                    const flat_idx = j * 4 + k;
                    const hmask_byte = Math.floor(flat_idx / 8);
                    const hmask_bit = flat_idx % 8;
                    const hb = hmask_byte < 32 ? (raw[bo + hmask_byte] >> hmask_bit) & 1 : 0;
                    const q3 = q2 | (hb << 2);
                    result[out_idx++] = d * (q3 - 4);
                }
            }
        }
        return result;
    }
    /**
     * Dequantize Q6_K format.
     * Simplified: read and approximate dequantization.
     */
    dequantizeQ6_K(fd, offset, n_elements) {
        const BLOCK_VALUES = 256;
        const BLOCK_BYTES = 210;
        const n_blocks = Math.ceil(n_elements / BLOCK_VALUES);
        const raw = Buffer.alloc(Math.min(n_blocks * BLOCK_BYTES, 50 * 1024 * 1024));
        const actual_blocks = Math.min(n_blocks, Math.floor(raw.length / BLOCK_BYTES));
        fs.readSync(fd, raw, 0, actual_blocks * BLOCK_BYTES, offset);
        const actual_elements = Math.min(n_elements, actual_blocks * BLOCK_VALUES);
        const result = new Float32Array(actual_elements);
        let out_idx = 0;
        for (let b = 0; b < actual_blocks && out_idx < actual_elements; b++) {
            const bo = b * BLOCK_BYTES;
            // Last 2 bytes are the fp16 scale
            const d = this.fp16ToFp32(raw.readUInt16LE(bo + 208));
            // Read quantized values (low 4 bits in first 128 bytes, high 2 bits in next 64)
            const ql = bo; // low nibbles: 128 bytes
            const qh = bo + 128; // high bits: 64 bytes
            const sc_off = bo + 192; // scales: 16 bytes
            for (let j = 0; j < 128 && out_idx < actual_elements; j++) {
                const lo_byte = raw[ql + j];
                const lo = lo_byte & 0x0F;
                const hi = (lo_byte >> 4) & 0x0F;
                // Combine with high bits
                const h_idx = Math.floor(j / 2);
                const h_byte = h_idx < 64 ? raw[qh + h_idx] : 0;
                const h_shift = (j % 2) * 2;
                const q6_lo = lo | (((h_byte >> h_shift) & 0x03) << 4);
                const q6_hi = hi | (((h_byte >> (h_shift + 4)) & 0x03) << 4);
                const sc_idx = Math.floor((j * 2) / 16);
                const sc = sc_idx < 16 ? (raw[sc_off + sc_idx] - 32) : 0;
                result[out_idx++] = d * sc * (q6_lo - 32);
                if (out_idx < actual_elements) {
                    result[out_idx++] = d * sc * (q6_hi - 32);
                }
            }
        }
        return result;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  LOW-LEVEL BINARY READERS
    // ═══════════════════════════════════════════════════════════════════════════
    readUint8(fd, offset) {
        const buf = Buffer.alloc(1);
        fs.readSync(fd, buf, 0, 1, offset);
        return buf.readUInt8(0);
    }
    readUint16(fd, offset) {
        const buf = Buffer.alloc(2);
        fs.readSync(fd, buf, 0, 2, offset);
        return buf.readUInt16LE(0);
    }
    readInt32(fd, offset) {
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, offset);
        return buf.readInt32LE(0);
    }
    readUint32(fd, offset) {
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, offset);
        return buf.readUInt32LE(0);
    }
    readFloat32(fd, offset) {
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, offset);
        return buf.readFloatLE(0);
    }
    readFloat64(fd, offset) {
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, offset);
        return buf.readDoubleLE(0);
    }
    readUint64AsNumber(fd, offset) {
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, offset);
        // Read as two uint32s to handle 64-bit
        const lo = buf.readUInt32LE(0);
        const hi = buf.readUInt32LE(4);
        return lo + hi * 0x100000000;
    }
    readInt64AsNumber(fd, offset) {
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, offset);
        const lo = buf.readUInt32LE(0);
        const hi = buf.readInt32LE(4);
        return lo + hi * 0x100000000;
    }
    readString(fd, offset) {
        const len = this.readUint64AsNumber(fd, offset);
        offset += 8;
        if (len > 1_000_000)
            throw new Error(`String too long: ${len}`);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, offset);
        return { value: buf.toString('utf-8'), new_offset: offset + len };
    }
    /** Convert IEEE 754 half-precision (fp16) to fp32 */
    fp16ToFp32(h) {
        const sign = (h >> 15) & 1;
        const exp = (h >> 10) & 0x1F;
        const frac = h & 0x3FF;
        if (exp === 0) {
            if (frac === 0)
                return sign ? -0 : 0;
            // Subnormal
            const val = (frac / 1024) * Math.pow(2, -14);
            return sign ? -val : val;
        }
        if (exp === 31) {
            return frac === 0 ? (sign ? -Infinity : Infinity) : NaN;
        }
        const val = Math.pow(2, exp - 15) * (1 + frac / 1024);
        return sign ? -val : val;
    }
    // ─── Metadata KV Parser ────────────────────────────────────────────────
    readMetadataKV(fd, offset) {
        const { value: key, new_offset: key_end } = this.readString(fd, offset);
        offset = key_end;
        const value_type = this.readUint32(fd, offset);
        offset += 4;
        const { value, new_offset } = this.readTypedValue(fd, offset, value_type);
        return { key, value, new_offset };
    }
    readTypedValue(fd, offset, type) {
        switch (type) {
            case GGUFValueType.UINT8:
                return { value: this.readUint8(fd, offset), new_offset: offset + 1 };
            case GGUFValueType.INT8: {
                const buf = Buffer.alloc(1);
                fs.readSync(fd, buf, 0, 1, offset);
                return { value: buf.readInt8(0), new_offset: offset + 1 };
            }
            case GGUFValueType.UINT16:
                return { value: this.readUint16(fd, offset), new_offset: offset + 2 };
            case GGUFValueType.INT16: {
                const buf = Buffer.alloc(2);
                fs.readSync(fd, buf, 0, 2, offset);
                return { value: buf.readInt16LE(0), new_offset: offset + 2 };
            }
            case GGUFValueType.UINT32:
                return { value: this.readUint32(fd, offset), new_offset: offset + 4 };
            case GGUFValueType.INT32:
                return { value: this.readInt32(fd, offset), new_offset: offset + 4 };
            case GGUFValueType.FLOAT32:
                return { value: this.readFloat32(fd, offset), new_offset: offset + 4 };
            case GGUFValueType.BOOL:
                return { value: this.readUint8(fd, offset) !== 0, new_offset: offset + 1 };
            case GGUFValueType.STRING:
                return this.readString(fd, offset);
            case GGUFValueType.UINT64:
                return { value: this.readUint64AsNumber(fd, offset), new_offset: offset + 8 };
            case GGUFValueType.INT64:
                return { value: this.readInt64AsNumber(fd, offset), new_offset: offset + 8 };
            case GGUFValueType.FLOAT64:
                return { value: this.readFloat64(fd, offset), new_offset: offset + 8 };
            case GGUFValueType.ARRAY: {
                const elem_type = this.readUint32(fd, offset);
                offset += 4;
                const arr_len = this.readUint64AsNumber(fd, offset);
                offset += 8;
                // For large arrays (like token lists), limit what we store
                const max_read = Math.min(arr_len, 50000);
                const arr = [];
                for (let i = 0; i < arr_len; i++) {
                    const { value, new_offset } = this.readTypedValue(fd, offset, elem_type);
                    if (i < max_read)
                        arr.push(value);
                    offset = new_offset;
                }
                return { value: arr, new_offset: offset };
            }
            default:
                throw new Error(`Unknown GGUF value type: ${type} at offset ${offset}`);
        }
    }
    // ─── Tensor Info Parser ────────────────────────────────────────────────
    readTensorInfo(fd, offset) {
        const { value: name, new_offset: name_end } = this.readString(fd, offset);
        offset = name_end;
        const n_dims = this.readUint32(fd, offset);
        offset += 4;
        const shape = [];
        for (let d = 0; d < n_dims; d++) {
            shape.push(this.readUint64AsNumber(fd, offset));
            offset += 8;
        }
        const type = this.readUint32(fd, offset);
        offset += 4;
        const tensor_offset = this.readUint64AsNumber(fd, offset);
        offset += 8;
        const total_elements = shape.reduce((a, b) => a * b, 1);
        const block_size = BLOCK_SIZE[type] || 32;
        const bytes_per_block = BYTES_PER_BLOCK[type] || 18;
        const n_blocks = Math.ceil(total_elements / block_size);
        const size_bytes = type === GGMLType.F32 ? total_elements * 4
            : type === GGMLType.F16 ? total_elements * 2
                : n_blocks * bytes_per_block;
        return {
            tensor: {
                name, n_dims, shape, type,
                type_name: GGML_TYPE_NAMES[type] || `unknown(${type})`,
                offset: tensor_offset,
                total_elements,
                size_bytes,
            },
            new_offset: offset,
        };
    }
}
