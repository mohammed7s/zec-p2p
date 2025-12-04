use aztec::macros::aztec;

pub mod types;
//pub mod test;

#[aztec]
pub contract OTCEscrow {
    // imports
    use aztec::{
        macros::{
            functions::{initializer, external},
            storage::storage
        },
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::PrivateImmutable
    };
    use token_contract::Token;
    use crate::types::config_note::ConfigNote;

    #[storage]
    struct Storage<Context> {
        config: PrivateImmutable<ConfigNote, Context>,
    }
    
    #[external("private")]
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

        storage.config
            .initialize(config)
            .emit(self_address, MessageDelivery.CONSTRAINED_ONCHAIN);
    }
    
    /**
     * OTC Offer Maker deposits tokens into the shared escrow
     *
     * @param _nonce - authwit nonce used in `transfer_private_to_private`
     * @return - the commitment for the partial note
     */
    #[external("private")]
    fn deposit_tokens(_nonce: Field) {
        let config = storage.config.get_note();
        let self_address = context.this_address();
        let caller = context.msg_sender().unwrap();

        // transfer tokens in
        Token::at(config.sell_token_address)
            .transfer_private_to_private(
                caller,
                self_address,
                config.sell_token_amount,
                _nonce
            )
            .call(&mut context);

        // emit nullifier to prevent multiple deposits
        let deposit_nullifier = config.get_nullifier(true);
        context.push_nullifier(deposit_nullifier);
    }

    // TODO: Add fulfill_with_attestation function here

    #[external("utility")]
    unconstrained fn get_config() -> ConfigNote {
        storage.config.view_note()
    }
}
