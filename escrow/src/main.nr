use aztec::macros::aztec;

pub mod types;
//pub mod test;

#[aztec]
pub contract OTCEscrow {
    // imports
    use aztec::{
        macros::{
            functions::{initializer, private, public},
            storage::storage
        },
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::PrivateImmutable
    };
    use token_contract::Token;
    use att_verifier::AttVerifier;
    use real_business_program::BusinessProgram;
    use crate::types::config_note::ConfigNote;

    #[storage]
    struct Storage<Context> {
        config: PrivateImmutable<ConfigNote, Context>,
    }
    
    #[private]
    #[initializer]
    fn constructor(
        sell_token_address: AztecAddress,
        sell_token_amount: u128,
        commitment_hash: Field,
        att_verifier_address: AztecAddress,
        revolut_business_logic_address: AztecAddress,
    ) {
        let self_address = context.this_address();

        // Create config note with zkTLS verification parameters
        let config = ConfigNote::new(
            self_address,
            sell_token_address,
            sell_token_amount,
            commitment_hash,
            att_verifier_address,
            revolut_business_logic_address,
        );

        storage.config.initialize(config);
    }
    
    /**
     * OTC Offer Maker deposits tokens into the shared escrow
     *
     * @param _nonce - authwit nonce used in `transfer_private_to_private`
     * @return - the commitment for the partial note
     */
    #[private]
    fn deposit_tokens(_nonce: Field) {
        let config = storage.config.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender().unwrap();

        // transfer tokens in (public -> private into escrow for simplicity)
        Token::at(config.sell_token_address)
            .transfer_to_private(self_address, config.sell_token_amount)
            .call(&mut context);

        // emit nullifier to prevent multiple deposits
        let deposit_nullifier = config.get_nullifier(true);
        context.push_nullifier(deposit_nullifier);
    }

    // TODO: Add fulfill_with_attestation function here

    #[private]
    fn get_config() -> ConfigNote {
        storage.config.get_note()
    }
}
