// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.9;

import "./ERC721MarketplaceBase.sol";

contract ERC721Marketplace is ERC721MarketplaceBase {
    using ArrayLibrary for address[];
    using ArrayLibrary for uint256[];

    function createSale(
        address contractAddr,
        uint256 tokenId,
        uint8 payment,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    ) external virtual isProperContract(contractAddr) {
        IERC721(contractAddr).transferFrom(msg.sender, address(this), tokenId);
        uint256 timestamp = block.timestamp;
        tokenIdToSales[contractAddr][tokenId] = Sale(
            msg.sender,
            payment,
            startPrice,
            endPrice,
            timestamp,
            duration
        );
        saleTokenIds[contractAddr].push(tokenId);
        saleTokenIdsBySeller[msg.sender][contractAddr].push(tokenId);
        emit SaleCreated(
            contractAddr,
            tokenId,
            payment,
            startPrice,
            endPrice,
            timestamp,
            duration
        );
    }

    function buy(address contractAddr, uint256 tokenId)
        external
        payable
        virtual
        isProperContract(contractAddr)
        nonReentrant
    {
        Sale memory sale = tokenIdToSales[contractAddr][tokenId];
        require(sale.startPrice > 0, "Not On Sale");
        require(sale.seller != msg.sender, "Caller Is Seller");
        uint256 price = getCurrentPrice(contractAddr, tokenId);
        _escrowFund(sale.payment, price);
        _payFund(sale.payment, price, sale.seller, contractAddr, tokenId);
        _removeSale(contractAddr, tokenId);
        IERC721(contractAddr).transferFrom(address(this), msg.sender, tokenId);
        emit SaleSuccessful(
            contractAddr,
            tokenId,
            sale.payment,
            price,
            msg.sender
        );
    }

    function cancelSale(address contractAddr, uint256 tokenId)
        external
        isProperContract(contractAddr)
    {
        Sale memory sale = tokenIdToSales[contractAddr][tokenId];
        require(sale.startPrice > 0, "Not On Sale");
        require(sale.seller == msg.sender, "Caller Is Not Seller");
        IERC721(contractAddr).transferFrom(address(this), sale.seller, tokenId);
        _removeSale(contractAddr, tokenId);
        emit SaleCancelled(contractAddr, tokenId);
    }

    function makeOffer(
        address contractAddr,
        uint256 tokenId,
        uint256 price
    ) external payable isProperContract(contractAddr) {
        Sale memory sale = tokenIdToSales[contractAddr][tokenId];
        require(sale.startPrice > 0, "Not On Sale");
        require(sale.seller != msg.sender, "Caller Is Seller");
        _escrowFund(sale.payment, price);
        tokenIdToOffers[contractAddr][tokenId].push(Offer(msg.sender, price));
        emit OfferCreated(contractAddr, tokenId, price, msg.sender);
    }

    function cancelOffer(address contractAddr, uint256 tokenId)
        external
        isProperContract(contractAddr)
    {
        Sale memory sale = tokenIdToSales[contractAddr][tokenId];
        require(sale.startPrice > 0, "Not On Sale");
        require(sale.seller != msg.sender, "Caller Is Seller");
        uint256 i;
        Offer[] storage offers = tokenIdToOffers[contractAddr][tokenId];
        for (; i < offers.length && offers[i].offerer != msg.sender; ++i) {}
        require(i < offers.length, "You Have No Offer");
        uint256 price = offers[i].offerPrice;
        _transferFund(sale.payment, price, msg.sender);
        removeAt(offers, i);
        emit OfferCancelled(contractAddr, tokenId, price, msg.sender);
    }

    function acceptOffer(address contractAddr, uint256 tokenId)
        external
        isProperContract(contractAddr)
    {
        Sale memory sale = tokenIdToSales[contractAddr][tokenId];
        require(sale.startPrice > 0, "Not On Sale");
        require(sale.seller == msg.sender, "Caller Is Not Seller");
        uint256 maxOffererId;
        Offer[] storage offers = tokenIdToOffers[contractAddr][tokenId];
        require(offers.length > 0, "No Offer On The Sale");
        for (uint256 i; i < offers.length; ++i) {
            if (offers[i].offerPrice > offers[maxOffererId].offerPrice) {
                maxOffererId = i;
            }
        }
        uint256 price = offers[maxOffererId].offerPrice;
        address offerer = offers[maxOffererId].offerer;
        _payFund(sale.payment, price, msg.sender, contractAddr, tokenId);
        IERC721(contractAddr).transferFrom(address(this), offerer, tokenId);
        removeAt(offers, maxOffererId);
        _removeSale(contractAddr, tokenId);
        emit OfferAccepted(contractAddr, tokenId, sale.payment, price, offerer);
    }

    function createAuction(
        address contractAddr,
        uint256 tokenId,
        uint8 payment
    ) external isProperContract(contractAddr) {
        IERC721(contractAddr).transferFrom(msg.sender, address(this), tokenId);
        tokenIdToAuctions[contractAddr][tokenId] = Auction(
            payment,
            msg.sender,
            new address[](0),
            new uint256[](0)
        );
        auctionTokenIds[contractAddr].push(tokenId);
        auctionTokenIdsBySeller[msg.sender][contractAddr].push(tokenId);
        emit AuctionCreated(contractAddr, tokenId, payment, msg.sender);
    }

    function bid(
        address contractAddr,
        uint256 tokenId,
        uint256 price
    ) external payable isProperContract(contractAddr) {
        Auction storage auction = tokenIdToAuctions[contractAddr][tokenId];
        require(auction.payment > 0, "Not On Auction");
        require(auction.auctioneer != msg.sender, "Caller Is Bidder");
        require(
            auction.bidders.findIndex(msg.sender) == auction.bidders.length,
            "Already Has Bid"
        );
        _escrowFund(auction.payment, price);
        auction.bidders.push(msg.sender);
        auction.bidPrices.push(price);
        emit AuctionBid(contractAddr, tokenId, msg.sender, price);
    }

    function cancelBid(address contractAddr, uint256 tokenId)
        external
        isProperContract(contractAddr)
    {
        Auction storage auction = tokenIdToAuctions[contractAddr][tokenId];
        require(auction.payment > 0, "Not On Auction");
        require(auction.auctioneer != msg.sender, "Caller Is Bidder");
        uint256 i = auction.bidders.findIndex(msg.sender);
        require(i < auction.bidders.length, "Has No Bid");
        _transferFund(
            auction.payment,
            auction.bidPrices[i],
            auction.bidders[i]
        );
        auction.bidders.removeAt(i);
        auction.bidPrices.removeAt(i);
        emit CancelBid(contractAddr, tokenId, msg.sender);
    }

    function cancelAuction(address contractAddr, uint256 tokenId)
        external
        payable
        isProperContract(contractAddr)
    {
        Auction memory auction = tokenIdToAuctions[contractAddr][tokenId];
        require(auction.payment > 0, "Not On Auction");
        require(auction.auctioneer == msg.sender, "Caller Is Not Auctioneer");
        IERC721(contractAddr).transferFrom(address(this), msg.sender, tokenId);
        _cancelAuction(contractAddr, tokenId);
        emit AuctionCancelled(contractAddr, tokenId, msg.sender);
    }

    function acceptBid(address contractAddr, uint256 tokenId)
        external
        isProperContract(contractAddr)
    {
        Auction storage auction = tokenIdToAuctions[contractAddr][tokenId];
        require(auction.payment > 0, "Not On Auction");
        require(auction.bidders.length > 0, "No Bids");
        require(auction.auctioneer == msg.sender, "Caller Is Not Auctioneer");
        uint256 maxBidderId = auction.bidPrices.findMaxIndex();
        address bidder = auction.bidders[maxBidderId];
        uint256 bidPrice = auction.bidPrices[maxBidderId];
        uint8 payment = auction.payment;
        _payFund(payment, bidPrice, msg.sender, contractAddr, tokenId);
        IERC721(contractAddr).transferFrom(address(this), bidder, tokenId);
        auction.bidders.removeAt(maxBidderId);
        auction.bidPrices.removeAt(maxBidderId);
        _cancelAuction(contractAddr, tokenId);
        emit BidAccepted(contractAddr, tokenId, payment, bidder, bidPrice);
    }
}
