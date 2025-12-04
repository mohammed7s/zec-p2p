use dep::aztec::macros::aztec;

#[aztec]
pub contract BusinessProgram {
    use aztec::macros::functions::external;
    global MAX_CONTENT_LEN: u32 = 1000;

    #[external("private")]
    fn verify(
        plain_json_response: [BoundedVec<u8, MAX_CONTENT_LEN>; 1],
        allowed_url_matches_hashes: [Field; 1],
    ) -> bool {
        // parse the data and verify custom condition
        true
    }
}
