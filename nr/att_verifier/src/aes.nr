use aztec::protocol_types::traits::Serialize;
use std::{collections::{bounded_vec::BoundedVec, vec::Vec}, ops::WrappingAdd};

#[derive(Serialize)]
pub struct BlockInfo {
    pub id: u32,
    pub mask: [u8; 16],
}

pub fn aes_decrypt_slot1536(key: [u8; 16], nonce: [u8; 12], ciphertext: [u8; 1536]) -> [u8; 1536] {
    // start from counter = 2 and generate exactly 1536 keystream bytes
    let keystream = compute_continuous_counters(key, nonce, 1536);
    let mut plaintext = [0u8; 1536];
    for i in 0..1536 {
        plaintext[i] = ciphertext[i] ^ keystream.get(i);
    }
    plaintext
}

// decryption in TLSData::verify
pub fn aes_decrypt_full(
    key: [u8; 16],
    nonce: [u8; 12],
    ciphertext: [u8; 512],
) -> BoundedVec<u8, 512> {
    // let keystream = compute_continuous_counters(key, nonce, ciphertext.len());
    let keystream = compute_continuous_counters(key, nonce, 512);
    let mut plaintext = BoundedVec::<u8, 512>::new();
    // for i in 0..ciphertext.len() { This fails when used in main function
    for i in 0..512 {
        plaintext.push(ciphertext[i] ^ keystream.get(i));
    }
    // TODO set len of plaintext to ciphertext.len()
    plaintext
}

// AES-128 encryption of a single block
pub fn aes128_encrypt_block(key: [u8; 16], plaintext: [u8; 16]) -> [u8; 16] {
    // use a zero IV for single block encryption
    let iv = [0u8; 16];
    // aes-cbc
    let ct_with_padding = std::aes128::aes128_encrypt(plaintext, iv, key);
    // ignore the padding added by aes-cbc
    let ct = [
        ct_with_padding[0],
        ct_with_padding[1],
        ct_with_padding[2],
        ct_with_padding[3],
        ct_with_padding[4],
        ct_with_padding[5],
        ct_with_padding[6],
        ct_with_padding[7],
        ct_with_padding[8],
        ct_with_padding[9],
        ct_with_padding[10],
        ct_with_padding[11],
        ct_with_padding[12],
        ct_with_padding[13],
        ct_with_padding[14],
        ct_with_padding[15],
    ];
    ct
}

// len: number of bytes to generate
pub fn compute_continuous_counters(key: [u8; 16], nonce: [u8; 12], len: u32) -> Vec<u8> {
    let mut result = Vec::<u8>::new();
    let mut nonce_index: [u8; 4] = [0u8; 4];
    // TODO - check if we should use incr_nonce or cast [u8; 4] to u32
    incr_nonce(&mut nonce_index);
    for _ in 0..(len / 16) + 1 {
        incr_nonce(&mut nonce_index);
        let mut full_nonce: [u8; 16] = [0u8; 16];
        full_nonce[0] = nonce[0];
        full_nonce[1] = nonce[1];
        full_nonce[2] = nonce[2];
        full_nonce[3] = nonce[3];
        full_nonce[4] = nonce[4];
        full_nonce[5] = nonce[5];
        full_nonce[6] = nonce[6];
        full_nonce[7] = nonce[7];
        full_nonce[8] = nonce[8];
        full_nonce[9] = nonce[9];
        full_nonce[10] = nonce[10];
        full_nonce[11] = nonce[11];
        full_nonce[12] = nonce_index[0];
        full_nonce[13] = nonce_index[1];
        full_nonce[14] = nonce_index[2];
        full_nonce[15] = nonce_index[3];
        let encrypted_counter = aes128_encrypt_block(key, full_nonce);
        for i in 0..16 {
            result.push(encrypted_counter[i]);
        }
    }
    result
}

pub fn incr_nonce(nonce: &mut [u8; 4]) {
    let number = nonce[3] as Field
        + (nonce[2] as Field) * 256
        + (nonce[1] as Field) * 256 * 256
        + (nonce[0] as Field) * 256 * 256 * 256;
    let mut new_number = (number as u32).wrapping_add(1) as Field;
    let new_bytes = new_number.to_be_bytes::<4>();
    nonce[0] = new_bytes[0];
    nonce[1] = new_bytes[1];
    nonce[2] = new_bytes[2];
    nonce[3] = new_bytes[3];
}

// mod tests {
//     use super::{
//         aes_decrypt_full, aes_decrypt_opt, BlockInfo, compute_continuous_counters,
//         compute_selective_counters, incr_nonce,
//     };
//     #[test]
//     fn test_incr_nonce() {
//         let mut nonce = [0u8; 4];
//         incr_nonce(&mut nonce);
//         assert_eq(nonce, [0, 0, 0, 1]);
//         nonce = [255, 255, 255, 255];
//         incr_nonce(&mut nonce);
//         assert_eq(nonce, [0, 0, 0, 0]);
//     }

//     #[test]
//     fn test_compute_continuous_counters() {
//         let key: [u8; 16] = [
//             0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
//             0x0e, 0x0f,
//         ];
//         let nonce: [u8; 12] =
//             [0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87, 0x78, 0x69, 0x5a, 0x4b];
//         let len: u32 = 64;
//         let keystream = compute_continuous_counters(key, nonce, len);
//         let test_result = Vec::<u8>::from_slice(&[
//             122, 138, 62, 182, 205, 220, 104, 14, 110, 12, 160, 26, 124, 84, 130, 197, 97, 138, 211,
//             174, 76, 169, 202, 227, 202, 156, 210, 67, 146, 207, 241, 35, 120, 114, 74, 124, 64,
//             252, 236, 78, 140, 142, 75, 216, 188, 71, 1, 227, 205, 212, 18, 120, 195, 191, 163, 192,
//             250, 94, 161, 69, 226, 129, 83, 42,
//         ]);
//         println(keystream);
//         for i in 0..len {
//             assert_eq(keystream.get(i), test_result.get(i));
//         }
//     }

//     #[test]
//     fn test_aes_decrypt_full() {
//         let key: [u8; 16] =
//             [63, 204, 165, 54, 208, 20, 174, 242, 130, 214, 214, 55, 22, 31, 205, 98];
//         let nonce: [u8; 12] = [61, 129, 199, 179, 217, 241, 135, 178, 51, 71, 77, 26];
//         let ciphertext = BoundedVec::<u8, 512>::from_array([
//             170, 113, 181, 52, 249, 171, 110, 100, 229, 185, 117, 199, 52, 25, 80, 150, 71, 194, 94,
//             200, 125, 149, 228, 117, 210, 142, 71, 244, 101, 139, 151, 147, 212, 203, 200, 228, 172,
//             142, 205, 57, 191, 180, 179, 18, 60, 23, 49, 64, 75, 186, 159, 36, 120, 42, 234, 40,
//             177, 95, 62, 43, 137, 213, 148, 218, 131, 147, 248, 10, 190, 44, 38, 67, 183, 19, 21,
//             52, 53, 103, 253, 133, 112, 150, 18, 175, 34, 184, 244, 192, 44, 24, 140, 207, 247, 133,
//             108, 41, 169, 180, 158, 49, 205, 132, 164, 220, 46, 91, 9, 228, 159, 65, 113, 230, 158,
//             72, 209, 125, 22, 86, 161, 206, 235, 60, 49, 243, 66, 237, 63, 9, 181, 237, 132, 34,
//             115, 54, 132, 1, 110, 13, 44, 223, 189, 73, 15, 247, 99, 130, 39, 175, 162, 105, 6, 61,
//             145, 196, 154, 168, 0, 19, 149, 21, 113, 215, 4, 23, 167, 156, 113, 4, 39, 60, 122, 87,
//             119, 222, 250, 21, 37, 53, 18, 33, 92, 221, 66, 252, 83, 150, 232, 165, 69, 241, 17,
//             133, 228, 251, 52, 92, 26, 201, 199, 207, 43, 11, 79, 161, 19, 211, 203, 192, 83, 60,
//             158, 20, 143, 89, 161, 68, 82, 150, 246, 124, 155, 242, 111, 114, 122, 92, 137, 100,
//             214, 51, 144, 188, 44, 163, 103,
//         ]);
//         let plaintext = BoundedVec::<u8, 512>::from_array([
//             72, 84, 84, 80, 47, 49, 46, 49, 32, 50, 48, 48, 32, 79, 75, 13, 10, 67, 111, 110, 116,
//             101, 110, 116, 45, 84, 121, 112, 101, 58, 32, 97, 112, 112, 108, 105, 99, 97, 116, 105,
//             111, 110, 47, 106, 115, 111, 110, 13, 10, 84, 114, 97, 110, 115, 102, 101, 114, 45, 69,
//             110, 99, 111, 100, 105, 110, 103, 58, 32, 99, 104, 117, 110, 107, 101, 100, 13, 10, 13,
//             10, 57, 54, 13, 10, 91, 10, 32, 32, 32, 32, 123, 10, 32, 32, 32, 32, 32, 32, 34, 97,
//             115, 115, 101, 116, 34, 58, 32, 34, 66, 84, 67, 34, 44, 10, 32, 32, 32, 32, 32, 32, 34,
//             102, 114, 101, 101, 34, 58, 32, 34, 49, 49, 46, 56, 48, 48, 51, 50, 57, 53, 50, 34, 44,
//             10, 32, 32, 32, 32, 32, 32, 34, 108, 111, 99, 107, 101, 100, 34, 58, 32, 34, 48, 46, 53,
//             34, 44, 10, 32, 32, 32, 32, 32, 32, 34, 102, 114, 101, 101, 122, 101, 34, 58, 32, 34,
//             57, 46, 51, 34, 44, 10, 32, 32, 32, 32, 32, 32, 34, 119, 105, 116, 104, 100, 114, 97,
//             119, 105, 110, 103, 34, 58, 32, 34, 48, 46, 48, 51, 34, 44, 10, 32, 32, 32, 32, 32, 32,
//             34, 105, 112, 111, 97, 98, 108, 101, 34, 58, 13, 10,
//         ]);
//         // println(ciphertext.len());
//         let decrypted = aes_decrypt_full(key, nonce, ciphertext);
//         for i in 0..plaintext.len() {
//             assert_eq(decrypted.get(i), plaintext.get(i));
//         }
//     }

//     #[test]
//     fn test_compute_seleted_counters() {
//         let key: [u8; 16] = [
//             0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
//             0x0e, 0x0f,
//         ];
//         let nonce: [u8; 12] =
//             [0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87, 0x78, 0x69, 0x5a, 0x4b];
//         let blocks = BoundedVec::<BlockInfo, 512>::from_array([
//             BlockInfo { id: 11, mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 12, mask: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
//             BlockInfo { id: 16, mask: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 17, mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 18, mask: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
//             BlockInfo { id: 25, mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0] },
//             BlockInfo { id: 48, mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 49, mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 50, mask: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
//             BlockInfo { id: 79, mask: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
//         ]);
//         let len = 71;
//         let key_stream = compute_selective_counters(key, nonce, blocks, len);
//         let result = [
//             125, 142, 174, 85, 254, 7, 65, 142, 159, 171, 240, 83, 153, 19, 96, 247, 217, 18, 110,
//             150, 115, 41, 149, 28, 44, 148, 200, 198, 250, 109, 78, 55, 200, 113, 67, 11, 69, 254,
//             45, 35, 45, 123, 220, 12, 178, 106, 30, 197, 242, 90, 74, 125, 72, 40, 176, 216, 26,
//             219, 120, 206, 231, 194, 225, 190, 241, 249, 225, 235, 233, 237, 117,
//         ];
//         for i in 0..result.len() {
//             assert_eq(result[i], key_stream.get(i));
//         }
//         println(result);
//     }

//     #[test]
//     fn test_aes_opt() {
//         let key: [u8; 16] =
//             [139, 166, 236, 104, 240, 177, 204, 204, 204, 36, 45, 73, 4, 13, 182, 245];
//         let nonce: [u8; 12] = [122, 198, 76, 112, 0, 0, 0, 0, 0, 0, 0, 2];
//         let ciphertext = BoundedVec::<u8, 512>::from_array([
//             160, 89, 104, 52, 14, 155, 75, 5, 183, 108, 3, 117, 99, 146, 168, 137, 235, 32, 144,
//             164, 212, 221, 233, 34, 161, 205, 3, 210, 52, 52, 126, 1, 12, 229, 205, 114, 97, 67, 6,
//             169, 130, 110, 248, 101, 189, 82, 32, 68, 94, 129, 93, 81, 140, 87, 39, 209, 166, 106,
//             77, 147, 37, 77, 105, 71, 48, 18, 83, 15, 152, 115, 175,
//         ]);
//         let plaintext = BoundedVec::<u8, 512>::from_array([
//             34, 99, 111, 114, 101, 34, 58, 123, 34, 115, 99, 114, 101, 101, 110, 95, 110, 97, 109,
//             101, 34, 58, 34, 112, 114, 105, 109, 117, 115, 95, 108, 97, 98, 115, 34, 125, 44, 34,
//             108, 101, 103, 97, 99, 121, 34, 58, 123, 34, 102, 111, 108, 108, 111, 119, 101, 114,
//             115, 95, 99, 111, 117, 110, 116, 34, 58, 56, 56, 49, 49, 49, 125,
//         ]);
//         let blocks = BoundedVec::<BlockInfo, 512>::from_array([
//             BlockInfo { id: 11, mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 12, mask: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
//             BlockInfo { id: 16, mask: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 17, mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 18, mask: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
//             BlockInfo { id: 25, mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0] },
//             BlockInfo { id: 48, mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 49, mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
//             BlockInfo { id: 50, mask: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
//             BlockInfo { id: 79, mask: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
//         ]);
//         let result = aes_decrypt_opt(key, nonce, blocks, ciphertext);
//         for i in 0..result.len() {
//             assert_eq(result.get(i), plaintext.get(i));
//         }
//         println(result);
//     }
// }
