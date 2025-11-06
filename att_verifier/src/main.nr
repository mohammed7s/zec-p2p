mod aes;
use dep::aztec::macros::aztec;

#[aztec]
pub contract AttVerifier {

    use aztec::{
        event::event_emission::emit_event_in_public,
        macros::{events::event, functions::{internal, private, public}},
        protocol_types::{address::AztecAddress, hash::poseidon2_hash},
    };
    use business_program::BusinessProgram;
    use sha256::sha256_var;
    use string_search::{StringBody, StringBody1024, SubString, SubString1024};

    global MAX_URL_LEN: u32 = 1024;
    global MAX_CONTENT_LEN: u32 = 1000;

    //Emitted public log limit: 13 fields
    #[event]
    struct SuccessEvent {
        sender: AztecAddress,
        att_verifier_address: AztecAddress,
        business_logic_address: AztecAddress,
        id: Field,
    }

    // Opcode count: 71055, Total gates by opcodes: 546716, Circuit size: 550.167
    #[private]
    fn verify_attestation(
        public_key_x: [u8; 32],
        public_key_y: [u8; 32],
        hash: [u8; 32],
        signature: [u8; 64],
        request_urls: [BoundedVec<u8, MAX_URL_LEN>; 2],
        allowed_urls: [BoundedVec<u8, MAX_URL_LEN>; 3],
        data_hashes: [[u8; 32]; 2],
        plain_json_response_contents: [BoundedVec<u8, MAX_CONTENT_LEN>; 2],
        business_logic_address: AztecAddress,
        id: Field, // id for this attestation
    ) -> bool {
        // 1. Check signature
        assert(std::ecdsa_secp256k1::verify_signature(public_key_x, public_key_y, signature, hash));

        // 2. Check that the request_url starts with one of the allowed_urls
        let mut allowed_url_matches: [Field; 2] = [0; 2];
        for i in 0..2 {
            // Safety: Get the index of the url in allowed_urls that matches request_url (unconstrained) and then check it
            let (found, url_index) =
                unsafe { get_allowed_url_index(request_urls[i], allowed_urls) };
            assert(found == true, "No allowed URL matches the request URL");
            let request_url_haystack: StringBody1024 =
                StringBody::new(request_urls[i].storage(), request_urls[i].len());
            let allowed_url = allowed_urls[url_index];
            let needle: SubString1024 = SubString::new(allowed_url.storage(), allowed_url.len());

            let (result, match_position): (bool, u32) =
                request_url_haystack.substring_match(needle);

            // A match result is only valid if the match position is 0 (i.e., the allowed_url is a prefix of request_url)
            assert(result & (match_position == 0), "URL check failed");
            let mut hash_input: [Field; 1024] = [0; 1024];
            for j in 0..1024 {
                if j < allowed_url.len() {
                    hash_input[j] = allowed_url.storage()[j] as Field;
                }
            }
            // TODO can we hash without the padding of zeroes?
            allowed_url_matches[i] = poseidon2_hash::<1024>(hash_input);
        }

        // 3. Hash plain_json_responses and check with input hashes
        for i in 0..2 {
            let hash = sha256_var(
                plain_json_response_contents[i].storage(),
                plain_json_response_contents[i].len() as u64,
            );
            assert(hash == data_hashes[i]);
        }

        let result = BusinessProgram::at(business_logic_address)
            .verify(plain_json_response_contents, allowed_url_matches)
            .call(&mut context);

        if result {
            AttVerifier::at(context.this_address())
                ._emit_success_event(
                    context.msg_sender().unwrap(),
                    context.this_address(),
                    business_logic_address,
                    id,
                )
                .enqueue(&mut context);
        }

        result
    }

    #[public]
    #[internal]
    fn _emit_success_event(
        sender: AztecAddress,
        att_verifier_address: AztecAddress,
        business_logic_address: AztecAddress,
        id: Field,
    ) {
        emit_event_in_public(
            SuccessEvent { sender, att_verifier_address, business_logic_address, id },
            &mut context,
        );
    }

    #[contract_library_method]
    unconstrained fn get_allowed_url_index(
        request_url: BoundedVec<u8, MAX_URL_LEN>,
        allowed_urls: [BoundedVec<u8, MAX_URL_LEN>; 3], // TODO this probably shouldn't have a fixed len
    ) -> (bool, u32) {
        let mut found = false;
        let mut index: u32 = 3050913689; // max u32 value to indicate "not found"
        for i in 0..allowed_urls.len() {
            let allowed_url = allowed_urls[i];
            if (allowed_url.len() <= request_url.len()) {
                let (result, match_position) = search(request_url, allowed_url);
                // If a valid result was already found we don't have to store again
                // (A valid result being that the match position is 0)
                if result & (match_position == 0) & !found {
                    found = true;
                    index = i;
                }
            }
        }
        (found, index)
    }

    // Adapted version of library function, which doesn't assert found to be true
    // https://github.com/noir-lang/noir_string_search/blob/v0.3.3/src/utils.nr#L1-L29
    #[contract_library_method]
    unconstrained fn search(
        haystack: BoundedVec<u8, MAX_URL_LEN>,
        needle: BoundedVec<u8, MAX_URL_LEN>,
    ) -> (bool, u32) {
        let haystack_length: u32 = haystack.len();
        let needle_length: u32 = needle.len();
        assert(needle_length > 0, "needle length of size 0 not supported");
        assert(haystack_length > 0, "haystack length of size 0 not supported");
        let mut found = false;
        let mut found_index: u32 = 0;
        for i in 0..haystack_length - needle_length + 1 {
            if (found == true) {
                break;
            }
            for j in 0..needle_length {
                if haystack.get(i + j) != needle.get(j) {
                    break;
                } else if (j == needle_length - 1) {
                    found = true;
                }
                if (found == true) {
                    found_index = i;
                    break;
                }
            }
        }

        (found, found_index)
    }
}
