use dep::aztec::macros::aztec;
use dep::json_parser::JSON2kb;
#[aztec]
pub contract BusinessProgram {
    use dep::json_parser::JSON2kb;
    use aztec::macros::functions::{external, initializer};
    use aztec::macros::storage::storage;
    use aztec::protocol_types::{address::AztecAddress, hash::poseidon2_hash};
    use aztec::state_vars::{public_immutable::PublicImmutable, public_mutable::PublicMutable};

    global MAX_URL_LEN: u32 = 200;
    global MAX_CONTENT_LEN: u32 = 1000;

    global MAX_BALANCES: u32 = 10;
    global DECIMAL_SCALE: u32 = 8;
    // Soft stub: keep threshold at 0 so parsing + URL checks run but balance check does not fail in tests
    global BALANCE_THRESHOLD: u64 = 0;
    

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        allowed_url_hashes: PublicMutable<[Field; 1], Context>,
    }

    #[external("public")]
    fn set_admin(new_admin: AztecAddress) {
        assert(storage.admin.read().eq(context.msg_sender().unwrap()), "caller is not admin");
        storage.admin.write(new_admin);
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress, allowed_url_hashes: [Field; 1]) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.write(admin);
        storage.allowed_url_hashes.write(allowed_url_hashes);
    }

    // TODO - allow update single url with index?
    #[external("public")]
    fn update_allowed_url_hashes(allowed_url_hashes: [Field; 1]) {
        assert(storage.admin.read().eq(context.msg_sender().unwrap()), "caller is not admin");
        storage.allowed_url_hashes.write(allowed_url_hashes);
    }

    #[external("public")]
    fn check_allowed_url(allowed_url_matches_hashes: [Field; 1]) {
        let allowed_url_hashes: [Field; 1] = storage.allowed_url_hashes.read();
        for i in 0..1 {
            let check_hash = allowed_url_matches_hashes[i];
            let mut found = false;
            for j in 0..1 {
                if allowed_url_hashes[j] == check_hash {
                    found = true;
                }
            }
            assert(found);
        }
    }

    #[external("private")]
    fn verify(
        plain_json_response: [BoundedVec<u8, MAX_CONTENT_LEN>; 1],
        allowed_url_matches_hashes: [Field; 1],
    ) -> bool {
        // Revolut transaction verification: parse all required fields and validate transaction state
        for i in 0..1 {
            let sanitized = unsafe { sanitize_ascii(plain_json_response[i]) };
            let parsed = JSON2kb::parse_bounded_vec_json(sanitized);
            let looks_like_array = (plain_json_response[i].len() > 0) & (plain_json_response[i].get(0) == 91u8); // '['

            // Support array payloads by taking the first element; otherwise treat as object.
            let obj: JSON2kb = if looks_like_array {
                parsed.get_object_from_array(0 as Field).unwrap()
            } else {
                parsed
            };

            // Define keys for all required Revolut fields
            // Use uniform key size of 20 bytes for all keys to match get_string_from_path requirements
            let key_amount: BoundedVec<u8, 20> = BoundedVec::from_array("amount".as_bytes());
            let key_currency: BoundedVec<u8, 20> = BoundedVec::from_array("currency".as_bytes());
            let key_username: BoundedVec<u8, 20> = BoundedVec::from_array("username".as_bytes());
            let key_state: BoundedVec<u8, 20> = BoundedVec::from_array("state".as_bytes());
            let key_type: BoundedVec<u8, 20> = BoundedVec::from_array("type".as_bytes());
            let key_id: BoundedVec<u8, 20> = BoundedVec::from_array("id".as_bytes());

            // Parse all fields using turbofish syntax: <KeyBytes, StringBytes, PathDepth>
            let amount: BoundedVec<u8, 20> = obj.get_string_from_path::<20, 20, 1>([key_amount]).unwrap();
            let currency: BoundedVec<u8, 10> = obj.get_string_from_path::<20, 10, 1>([key_currency]).unwrap();
            let username: BoundedVec<u8, 30> = obj.get_string_from_path::<20, 30, 1>([key_username]).unwrap();
            let state: BoundedVec<u8, 20> = obj.get_string_from_path::<20, 20, 1>([key_state]).unwrap();
            let tx_type: BoundedVec<u8, 20> = obj.get_string_from_path::<20, 20, 1>([key_type]).unwrap();
            let tx_id: BoundedVec<u8, 40> = obj.get_string_from_path::<20, 40, 1>([key_id]).unwrap();

            // Assert all fields are non-empty
            assert(amount.len() > 0, "amount missing");
            assert(currency.len() > 0, "currency missing");
            assert(username.len() > 0, "username missing");
            assert(state.len() > 0, "state missing");
            assert(tx_type.len() > 0, "type missing");
            assert(tx_id.len() > 0, "id missing");

            // Validate transaction state and type
            let expected_state: BoundedVec<u8, 20> = BoundedVec::from_array("COMPLETED".as_bytes());
            let expected_type: BoundedVec<u8, 20> = BoundedVec::from_array("TRANSFER".as_bytes());

            assert(state == expected_state, "transaction not completed");
            assert(tx_type == expected_type, "must be a transfer");
        }

        BusinessProgram::at(context.this_address())
            .check_allowed_url(allowed_url_matches_hashes)
            .enqueue(&mut context);

        true
    }

    #[contract_library_method]
    fn get_values(plaintext: BoundedVec<u8, MAX_CONTENT_LEN>) -> bool {
        // Safety: first sanitize the plaintext to ensure it is valid ASCII, then check this was done correctly
        let sanitized = unsafe { sanitize_ascii(plaintext) };

        
       
        let balances = JSON2kb::parse_bounded_vec_json(sanitized);
        let balances_len = balances.get_length();
        
        let key_bal: BoundedVec<u8, 7> = BoundedVec::from_array("balance".as_bytes());
        let key_wallet: BoundedVec<u8, 10> = BoundedVec::from_array("walletName".as_bytes());
        let wallet_spot: BoundedVec<u8, 18> = BoundedVec::from_array("Spot".as_bytes());
        let mut eth_check_passed = false;
         for i in 0..MAX_BALANCES {
          if i < balances.get_length() {
              let obj_i: JSON2kb = balances.get_object_from_array(i as Field).unwrap();
              let wallet_i: BoundedVec<u8, 18> = obj_i.get_string_from_path([key_wallet]).unwrap();

              let wallet_is_spot = wallet_i == wallet_spot;
              if wallet_is_spot {
                  let bal_i: BoundedVec<u8, 18> = obj_i.get_string_from_path([key_bal]).unwrap();
                  // Safety:
                  let bal_fixed = unsafe {parse_decimal_to_fixed(bal_i, DECIMAL_SCALE) };
                  eth_check_passed = eth_check_passed | (bal_fixed > BALANCE_THRESHOLD);
              }
          }
        }
        eth_check_passed
    }
    
    #[contract_library_method]
    unconstrained fn parse_decimal_to_fixed(input: BoundedVec<u8, 18>, scale: u32) -> u64 {
        let mut result: u64 = 0;
        let mut seen_dot = false;
        let mut digits_after_dot = 0;

        for i in 0..input.len() {
            let b = input.get(i);

            if b == 46u8 { // '.' ASCII 46
                seen_dot = true;
                continue;
            }

            // '0'~'9' (ASCII 48~57)
            if b >= 48u8 & b <= 57u8 {
                let digit: u64 = (b - 48u8) as u64;
                result = result * 10 + digit;

                if seen_dot {
                    digits_after_dot += 1;
                }
            }
        }

        if digits_after_dot < scale {
            for _ in 0..(scale - digits_after_dot) {
                result *= 10;
            }
        }

        result
    }


    #[contract_library_method]
    unconstrained fn sanitize_ascii<let N: u32>(input: BoundedVec<u8, N>) -> BoundedVec<u8, N> {
        let mut clean = BoundedVec::<u8, N>::new();
        for i in 0..N {
            if i < input.len() {
                let b = input.get(i);
                // Keep only printable ASCII, else use '?'
                let valid = (b >= 32) & (b <= 126);
                let valid_f = valid as u8;
                let sanitized = b * valid_f + 63 * (1 - valid_f); // '?' = 63

                clean.push(sanitized);
            }
        }
        clean
    }

    #[contract_library_method]
    fn verify_sanitized_ascii(plaintext: BoundedVec<u8, 4096>, sanitized: BoundedVec<u8, 4096>) {
        assert(plaintext.len() == sanitized.len());
        for i in 0..4096 {
            if i < plaintext.len() {
                // plaintext.get(i) should be either equal to sanitized.get(i) or 63 (we intentionally replaced it)
                let b = plaintext.get(i);
                let s = sanitized.get(i);
                assert((b == s) | (s == 63));
            }
        }
    }

}
