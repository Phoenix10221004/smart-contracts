// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/security/PullPayment.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DrDao is ERC721Enumerable, Ownable, PullPayment {
    using Strings for uint256;

    string baseURI;
    string public baseExtension = ".json";
    uint256 public cost = 699 ether;
    uint256 public nftFMPrice = 649 ether;
    uint256 public Wlcost = 599 ether;
    uint256 constant public maxSupply = 297;
    uint256 public maxMintAmount = 3;
    mapping(address => uint256) public mintPerWallet;
    uint256 public maxWhitelistMintAmount = 150;
    bool public paused = false;
    uint256[maxSupply] internal availableIds;

    address[] holders;
    uint256[] counts;
    mapping(address => bool) public whitelisted;

    uint256 public curIndex;
    uint256 public whitelistMintAmount;
    
    address public daoWallet = 0xE8B0D3c9947FEa5e76552f4b5c5Cabc81386bfe7;
    IERC721 public IFMF1;
    IERC721 public ICrosmonaut;

    uint256 public PRESALE = 1656086400; // June, 24th 16:00 UTC
    uint256 public PUBLICSALE = 1656091800; // June, 24th 17:30 UTC

    uint256 public cyborgswapFee = 25; // 2.5%
    address public cyborgswapWallet = 0x97E4ae563f5Ea9fe63DA7abaCaEE2C8Cd54C3FC0;

    constructor(string memory _initBaseURI, address _fmf1, address _crosmonaut) ERC721("DrDao", "DRD") {
        setBaseURI(_initBaseURI);
        IFMF1 = IERC721(_fmf1);
        ICrosmonaut = IERC721(_crosmonaut);
        _mintForTeam();
    }

    // internal
    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function _getNewId(uint256 _totalMinted) internal returns(uint256 value) {
        uint256 remaining = maxSupply - _totalMinted;
        uint256 rand = uint256(keccak256(abi.encodePacked(msg.sender, block.difficulty, block.timestamp, remaining))) % remaining;
        value = 0;
        // if array value exists, use, otherwise, use generated random value
        if (availableIds[rand] != 0)
        value = availableIds[rand];
        else
        value = rand;
        // store remaining - 1 in used ID to create mapping
        if (availableIds[remaining - 1] == 0)
        availableIds[rand] = remaining - 1;
        else
        availableIds[rand] = availableIds[remaining - 1];
        value += 1;
    } 

    // public
    function mint(uint256 amount) public payable {
        require(!paused, "paused");
        uint256 currentTimestamp = block.timestamp;
        require(currentTimestamp >= PRESALE, "Sale not started");
        if (currentTimestamp < PUBLICSALE) {
            require(whitelisted[msg.sender] == true, "Only Whitelist can mint in presale");
        }
        require(amount > 0, "amount shouldn't be zero");
        require(mintPerWallet[msg.sender] + amount <= maxMintAmount, "Can't mint more than max Mint");
        uint256 supply = totalSupply();
        require(supply + amount <= maxSupply, "Max supply exceeded");
        uint256 price = cost;
        if (isMember(msg.sender)) price = nftFMPrice;
        if (
            whitelisted[msg.sender] &&
            whitelistMintAmount + amount <= maxWhitelistMintAmount
        ) {
            price = Wlcost;
            whitelistMintAmount += amount;
        }
        require(msg.value >= price * amount, "insufficient funds");
        for (uint256 i = 0; i < amount; i++) {
            _safeMint(msg.sender, _getNewId(supply+i));
        }
        mintPerWallet[msg.sender] += amount;
        uint256 amountFee = ((price * amount) * cyborgswapFee) / 1000;
        _asyncTransfer(cyborgswapWallet, amountFee);
        payable(daoWallet).transfer(address(this).balance);
    }

    function walletOfOwner(address _owner)
        public
        view
        returns (uint256[] memory)
    {
        uint256 ownerTokenCount = balanceOf(_owner);
        uint256[] memory tokenIds = new uint256[](ownerTokenCount);
        for (uint256 i; i < ownerTokenCount; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(_owner, i);
        }
        return tokenIds;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(
            _exists(tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );

        string memory currentBaseURI = _baseURI();
        return
            bytes(currentBaseURI).length > 0
                ? string(
                    abi.encodePacked(
                        currentBaseURI,
                        tokenId.toString(),
                        baseExtension
                    )
                )
                : "";
    }

    function isMember(address _address) public view returns (bool) {
        return
            IFMF1.balanceOf(_address) > 0 ||
            ICrosmonaut.balanceOf(_address) > 0;
    }

    function setCost(uint256 _newCost) public onlyOwner {
        cost = _newCost;
    }

    function setFMCost(uint256 _newCost) public onlyOwner {
        nftFMPrice = _newCost;
    }

    function setWlcost(uint256 _newWlcost) public onlyOwner {
        Wlcost = _newWlcost;
    }

    function setWhitelisted(address _address, bool _whitelisted)
        public
        onlyOwner
    {
        whitelisted[_address] = _whitelisted;
    }

    function setWhitelistAddresses(address[] memory addresses) public onlyOwner {
        for (uint i = 0; i < addresses.length; i++) {
            whitelisted[addresses[i]] = true;
        }
    }

    function setmaxMintAmount(uint256 _newmaxMintAmount) public onlyOwner {
        maxMintAmount = _newmaxMintAmount;
    }

    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI = _newBaseURI;
    }

    function setBaseExtension(string memory _newBaseExtension)
        public
        onlyOwner
    {
        baseExtension = _newBaseExtension;
    }

    function pause(bool _state) public onlyOwner {
        paused = _state;
    }

    function setAirDropCounts(
        address[] memory _holders,
        uint256[] memory _counts
    ) external onlyOwner {
        require(_holders.length == _counts.length, "Input Data error");
        for (uint256 i = 0; i < _holders.length; i++) {
            holders.push(_holders[i]);
            counts.push(_counts[i]);
        }
    }

    function airDropNFT(uint256 amount) external {
        require(curIndex < holders.length, "No more step");
        uint256 endID = curIndex + amount;
        if (endID > holders.length) endID = holders.length;
        uint256 supply = totalSupply();

        for (; curIndex < endID; curIndex++) {
            for (uint256 idx = 0; idx < counts[curIndex]; idx++)
                _safeMint(holders[curIndex], _getNewId(supply+idx));
            supply += counts[curIndex];
        }
    }

    //
    function mintCost(address _minter)
        external
        view
        returns (uint256)
    {
        if (whitelisted[_minter]) return Wlcost;
        if (isMember(_minter) == true) return nftFMPrice;
        return cost;
    }

    function _mintForTeam() private {
        for (uint i = 275; i <= 297; i++) {
            _safeMint(daoWallet, i);
        }
    }
}
