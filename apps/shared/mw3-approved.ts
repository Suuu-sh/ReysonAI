// Build-owned approval pins. Artifact metadata, URLs and database rows cannot
// authorize a policy. Changes require independent source and policy review.
// Bounded AI estimates; final delivery, browser QA and release are separate gates.
export type Mw3ApprovedPolicy = {
  spotId: string;
  stage: "flop" | "later";
  deliveryHash: string;
  implementationHash: string;
  policyHash: string;
  sourceHash: string;
};
export const MW3_APPROVED_POLICIES: readonly Mw3ApprovedPolicy[] = Object.freeze([
  {
    "spotId": "CO_open_BTN_call_BB_call",
    "stage": "flop",
    "deliveryHash": "4c8d43795b1d11d85d938c877431a72be30bc68269d10f7e4bc26de1cdeed8ad",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "3682c70f1cd131a825d67dc564bb45706d5b8885c0de4ef6bfe8493fe13fef06",
    "sourceHash": "9826ec09f4b8420f866c8ac656e6f755966423c2d843bcb604eff97dbd6a89c3"
  },
  {
    "spotId": "CO_open_BTN_call_BB_call",
    "stage": "later",
    "deliveryHash": "bcdeb4ca96a84c211ef508bc422436a40a355c1e343218cd0fee509a422d8148",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "d840d8174ff3ad1fe983e5fbd0696b9c28296f5e4d8af394b12d76e070b18582",
    "sourceHash": "9826ec09f4b8420f866c8ac656e6f755966423c2d843bcb604eff97dbd6a89c3"
  },
  {
    "spotId": "CO_open_BTN_call_SB_call",
    "stage": "flop",
    "deliveryHash": "5d30c32819503b35eb4776cbb6ff3ccd65b83a30b4df48fa9ee57ad5b676735f",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "20fb64ba62887d36b0280c0b9c49b87d735713ec70f8797de22d0530654ee2bb",
    "sourceHash": "3573dde6357353f3d848b0370205de4cc99ee11ced39267b35e65927bc235e0d"
  },
  {
    "spotId": "CO_open_BTN_call_SB_call",
    "stage": "later",
    "deliveryHash": "300deabfd54fff4225a00ba8ff84d3aeef0f6c48517d592d446125b2fb2b6d23",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "214f4e53cea61b08d0941f6eaf083950eb24eeee95a7cab36f5dd6ba28bc7211",
    "sourceHash": "3573dde6357353f3d848b0370205de4cc99ee11ced39267b35e65927bc235e0d"
  },
  {
    "spotId": "HJ_open_BTN_call_BB_call",
    "stage": "flop",
    "deliveryHash": "da4cba6972420b5ff615d6392d47dc963b0638a29c747b9314f2cf871d95e7cc",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "6f6a824c47368119bfe3ac6761e0ac5993f9eec3a352d505ce949e5c0b76b593",
    "sourceHash": "6762971b2c93bc1d26aec6a2e82cc9292a03fb22e6cc497c9b0e346ae3f9df45"
  },
  {
    "spotId": "HJ_open_BTN_call_BB_call",
    "stage": "later",
    "deliveryHash": "c53b9061809b04c62af049e0a9eec8c37f4295e977384a5c3497f6132737b6ba",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "764e2765a604e30c5e981b481946918de916004e135d7b98619aa9670185b33c",
    "sourceHash": "6762971b2c93bc1d26aec6a2e82cc9292a03fb22e6cc497c9b0e346ae3f9df45"
  },
  {
    "spotId": "HJ_open_BTN_call_SB_call",
    "stage": "flop",
    "deliveryHash": "cee641a36e91368a41b1f7e79622dd90b464d425c4f5b127956ff4c90b9323c2",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "2b74e501f33fb5713bca56c692ff5834ace14ac146dbbe8dc73fbdc4cf3156e5",
    "sourceHash": "380bee458c9d5e112d268dab4e0d4ef201a45a58babe78234c5e6af0c91f6235"
  },
  {
    "spotId": "HJ_open_BTN_call_SB_call",
    "stage": "later",
    "deliveryHash": "2e6ce4d41eb9857465199f2774e702590b738530df09429c6b3523761b441cfc",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "2bcb06e852bc7de9a4dcf47b37016be0fea2d413e925971a921d0131d22b3234",
    "sourceHash": "380bee458c9d5e112d268dab4e0d4ef201a45a58babe78234c5e6af0c91f6235"
  },
  {
    "spotId": "HJ_open_CO_call_BB_call",
    "stage": "flop",
    "deliveryHash": "75fffa9b7c5af63da62d254fc23b06dfe85d79313bbde5e72ff2536556ed12e1",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "ddee6d15195c7b205e52b0c2d8da2dc32258ac1a1cdaeb61f3213877a65e4b0f",
    "sourceHash": "23bc49a7a78a03506d6f0d73dfd541dc5cc81397b26a7338f47810f7326843c2"
  },
  {
    "spotId": "HJ_open_CO_call_BB_call",
    "stage": "later",
    "deliveryHash": "7df78fdad444be2866905f02df9a05dd6d3e3b3de76103f5ba83cacf82da2607",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "c97fae4f58b39daaab0497253ae27e84b48527b492ccb687dffccd70c87d7403",
    "sourceHash": "23bc49a7a78a03506d6f0d73dfd541dc5cc81397b26a7338f47810f7326843c2"
  },
  {
    "spotId": "HJ_open_CO_call_BTN_call",
    "stage": "flop",
    "deliveryHash": "e7773c69bd680c1271612c3ebfc15c899872aa1655737b146d70497a673a323e",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "4d70d9c413145446820b4c528c98dad9f3b87f7968230bc4e7ac5b29c98645de",
    "sourceHash": "278b706399c3efc7907abdc072b0060e2f40e188cb6b4fa05a633544ef86080d"
  },
  {
    "spotId": "HJ_open_CO_call_BTN_call",
    "stage": "later",
    "deliveryHash": "7e499cb944dd020b96ac35b55cdfd26f2699e55acf251b123d4c18a0ef5ac216",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "c6c3a9dbba07d11d6ae3534f6c580fc7c5aa0c7ebc6094a3bd5eab80794e590c",
    "sourceHash": "278b706399c3efc7907abdc072b0060e2f40e188cb6b4fa05a633544ef86080d"
  },
  {
    "spotId": "HJ_open_CO_call_SB_call",
    "stage": "flop",
    "deliveryHash": "ce8132397a2eccb7c3b2c41dbb3d1058f4292d2c22100eb5292869cb16155704",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "78a92f687a5a4fcc623ae4b91608d12eead3592c8ab9b07244e1b2858a8a33fa",
    "sourceHash": "d9d3209ec4900d28ca2d8259c813c5bd48d4019528f2123cc6ed168e22c8cbb1"
  },
  {
    "spotId": "HJ_open_CO_call_SB_call",
    "stage": "later",
    "deliveryHash": "9029fab129d6d3dfc9b5cfb057343e4cac14500da275708cd40b7c0421e9ed94",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "1382306ac507d03a34e8222e9543e809c6fdd164470df7eaafafe76f69fb2586",
    "sourceHash": "d9d3209ec4900d28ca2d8259c813c5bd48d4019528f2123cc6ed168e22c8cbb1"
  },
  {
    "spotId": "UTG_open_BTN_call_BB_call",
    "stage": "flop",
    "deliveryHash": "4aa2ec01bfe9d59f86193b3a170390084cfed23513f3236353f34364b78517d5",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "5405d51426d387f652d4447e0afc54186c2a6ed22637083d9aed3e628824be70",
    "sourceHash": "3effc9977afa66aa817c2e1c697f6789a593bdf3418741ab33fe34236dd5b7f2"
  },
  {
    "spotId": "UTG_open_BTN_call_BB_call",
    "stage": "later",
    "deliveryHash": "d7c52388810b7944b23e242862e9e112b6a08fa26d73ca5a61ee373bd9c6df15",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "282afaf9fa0cecc7ae680a18707a1aa71a16bb4fc7dd15463031d7fddfe898aa",
    "sourceHash": "3effc9977afa66aa817c2e1c697f6789a593bdf3418741ab33fe34236dd5b7f2"
  },
  {
    "spotId": "UTG_open_BTN_call_SB_call",
    "stage": "flop",
    "deliveryHash": "029d0402b784532ad46b5e2ecce71c3a1540ea0a30539d64150bcf9d4811310e",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "c608d2b4eeaf2c9419f27fb7fa9ed818ee07ecb370e704db92268fcb806612d7",
    "sourceHash": "2aa18f5793aa280d843bd3f175f391cc3409186c21e08bcc7b63570aab558858"
  },
  {
    "spotId": "UTG_open_BTN_call_SB_call",
    "stage": "later",
    "deliveryHash": "08f2e05bd9745f5ad5d476b96930592bcf889325d984ca686acb61a287d7bfd3",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "2616b7536253785714314be66ae6084d7ae8004dbf8773cf5e183b22bc7396f7",
    "sourceHash": "2aa18f5793aa280d843bd3f175f391cc3409186c21e08bcc7b63570aab558858"
  },
  {
    "spotId": "UTG_open_CO_call_BB_call",
    "stage": "flop",
    "deliveryHash": "bd91d467dbaf60b1ae5bb4e265d81ede9173befd88ac613eabdec459d16dafee",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "e8ad7a1aa002559e51f485ef68f4163ce9ba5955be5d0bcc7b83f4250bda48ef",
    "sourceHash": "4ca502b9b4c22ca9d67058d9be52c52539549f2442cfb08983296d09afacd95d"
  },
  {
    "spotId": "UTG_open_CO_call_BB_call",
    "stage": "later",
    "deliveryHash": "f669db4d3263a3049fcf3ccaa1bf898670dad7214cad87cbf41e8ff464f01fa8",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "a9aea007ce66ddaae4d08843e6280f777d10f38aa4c353aa737e8a22e21bb772",
    "sourceHash": "4ca502b9b4c22ca9d67058d9be52c52539549f2442cfb08983296d09afacd95d"
  },
  {
    "spotId": "UTG_open_CO_call_BTN_call",
    "stage": "flop",
    "deliveryHash": "76bb1356d12a275d0351fd48e9b7c5d8bd2ea42f646552197d35a217be56d8f8",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "5b7868e198248e206b68b42934d11ae51a250695f3e80da609192bfce5fc4527",
    "sourceHash": "e1328f1fc8ad265f473579189abf32246e4b7bf5bdd2cdc108bea1b2b59f15ed"
  },
  {
    "spotId": "UTG_open_CO_call_BTN_call",
    "stage": "later",
    "deliveryHash": "c196c22dd82a699ceeb828a43edfb53cbc72db52ee5a6166bbe10a31ef367a27",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "20925575ef96ecf8af3bc94e84bf390a1a8a411acd8d0699f1a685233db05297",
    "sourceHash": "e1328f1fc8ad265f473579189abf32246e4b7bf5bdd2cdc108bea1b2b59f15ed"
  },
  {
    "spotId": "UTG_open_CO_call_SB_call",
    "stage": "flop",
    "deliveryHash": "0bb86ee2d5cb471d9954a7d7f3cc11a9629744f9934329662f2d1c55d6697a31",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "8c86933a924941071673fb70a6767b5c99a8db402fd5348a7c9a915d7b2574d0",
    "sourceHash": "552657bcc5e1dd53785ecd44d152a9367e1296ec7e7263ef90d5b5b47394af60"
  },
  {
    "spotId": "UTG_open_CO_call_SB_call",
    "stage": "later",
    "deliveryHash": "4141a16a5845c07afea24a466df27d0499e7ba4ff479561ede64e9800ed497fd",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "1968323969e89f53b7c792bccbf81ef7ea10555e19392b63d38a3e1b5b26b46d",
    "sourceHash": "552657bcc5e1dd53785ecd44d152a9367e1296ec7e7263ef90d5b5b47394af60"
  },
  {
    "spotId": "UTG_open_HJ_call_BB_call",
    "stage": "flop",
    "deliveryHash": "281abf5777b51568dc98ae2a7b7fbc37727062e99a882431b49a5807c73cbdde",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "92cdeb04b45c836e4f6e266bc3b985ef463386544423140ed8a661a60f30c2fc",
    "sourceHash": "3d53be2b1a7c90f5950be69b82850ef81fa535e3442d836368e914fdf55b2862"
  },
  {
    "spotId": "UTG_open_HJ_call_BB_call",
    "stage": "later",
    "deliveryHash": "742daf0c4e7d7a4a3c4a9b7012e1adbdab5ea6ed08dac28414412d190d9bb8d3",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "c7039fc8732099fa9d5e2d34eb938fc7e9342baa2c0a3ec789050abe2b3f0840",
    "sourceHash": "3d53be2b1a7c90f5950be69b82850ef81fa535e3442d836368e914fdf55b2862"
  },
  {
    "spotId": "UTG_open_HJ_call_BTN_call",
    "stage": "flop",
    "deliveryHash": "5439f957cdcbbc13d5d8ad23ec5b685e5b03a726e6111c96c1527134ac43cb9a",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "89473138898d53835332a3777235f611216427e2d653adc8808dfaafb3bc11d8",
    "sourceHash": "bf2cc8a36a97c8b77c2ee525d9bebfb774814f3e21b1aea53cb46c1b21c45e8e"
  },
  {
    "spotId": "UTG_open_HJ_call_BTN_call",
    "stage": "later",
    "deliveryHash": "234b4b1dde7a12b0d47fbbb508d7ee41c3616c369bb7eb3dc2f7acd3b9496068",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "8bdb93150f6528eb7613fae8a91a61a2f443a34ca6848526f63fb89063c0a287",
    "sourceHash": "bf2cc8a36a97c8b77c2ee525d9bebfb774814f3e21b1aea53cb46c1b21c45e8e"
  },
  {
    "spotId": "UTG_open_HJ_call_CO_call",
    "stage": "flop",
    "deliveryHash": "f957d312947d1eec25b3341bbf3f6e8d757265688cbf939cf6e781ac2f272cbb",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "d6ee35e17d0287de2150fade7b14a1eb32dd047a866d67e33510240fe83a9205",
    "sourceHash": "f8d9dc162bd8bb8e401972747dba8e8ce8b8d244d7419af718376ad368d08734"
  },
  {
    "spotId": "UTG_open_HJ_call_CO_call",
    "stage": "later",
    "deliveryHash": "adc75543803c6dceae64be212bf0a2fd63869babbcd2f8a8fbf3523b119f5af7",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "e67aaaf82ed04e6c290675cc2f6dc68c33bb9ef751d84ada53ebc171eb9e3f0e",
    "sourceHash": "f8d9dc162bd8bb8e401972747dba8e8ce8b8d244d7419af718376ad368d08734"
  },
  {
    "spotId": "UTG_open_HJ_call_SB_call",
    "stage": "flop",
    "deliveryHash": "70131b3742203fad717c5d2a418e270476ebd0f4906d9a99e55c21d7714ae9c8",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "a1e92759270e9fd3f0911b080cd42b46898bf0e3749ea7c403f0f6768dd688c1",
    "sourceHash": "ced4f58d35c1636ee9b4197eef7c636823e8dd0a2f4718f39a3d0b84f5f267c9"
  },
  {
    "spotId": "UTG_open_HJ_call_SB_call",
    "stage": "later",
    "deliveryHash": "af5e72db20253f928399c0fbba2413c232a323b5c0b8be005ccacfc28862b68b",
    "implementationHash": "4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113",
    "policyHash": "5c7413b2881aa52304ff3ebe7d2911dace4bb9a2deda13a7a838bc0fd03ac5d9",
    "sourceHash": "ced4f58d35c1636ee9b4197eef7c636823e8dd0a2f4718f39a3d0b84f5f267c9"
  }
]);
