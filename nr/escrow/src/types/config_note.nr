use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{
        traits::{Deserialize, Serialize, Packable},
        address::AztecAddress,
    },  
};
use poseidon::poseidon2::Poseidon2;


#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct ConfigNote {
     pub owner: AztecAddress,
     pub sell_token_address: AztecAddress,
     pub sell_token_amount: u128,
     pub commitment_hash: Field,
     pub att_verifier_address: AztecAddress,
     pub revolut_business_logic_address: AztecAddress,
     pub randomness: Field,
  }


impl ConfigNote {
    pub fn new(
        owner: AztecAddress,
        sell_token_address: AztecAddress,
        sell_token_amount: u128,
        commitment_hash: Field,
        att_verifier_address: AztecAddress,
        revolut_business_logic_address: AztecAddress,
    ) -> Self {
        // Safety: random() generates note randomness for privacy
        Self {
            owner,
            sell_token_address,
            sell_token_amount,
            commitment_hash,
            att_verifier_address,
            revolut_business_logic_address,
            randomness: unsafe { random() }
        }
    }

    pub fn get_nullifier(self, deposit: bool) -> Field {
        let serialized = self.serialize();
        let preimage = serialized.concat([deposit as Field]);
        Poseidon2::hash(preimage, 8)
    }
}
