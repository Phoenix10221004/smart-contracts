const { expect } = require('chai')
const { parseEther } = require('ethers/lib/utils')
const { ethers, upgrades } = require('hardhat')

describe('ERC721 NFT Marketplace Smart Contract', () => {
  let Custom721Factory, Custom721RoyaltyFactory, AddressesFactory, ERC721SaleFactory, ERC721AuctionFactory, ProxyFactory, ArrayLibraryFactory, SparkTokenFactory
  let custom721, custom721Royalty, addresses, erc721Sale, erc721Auction, proxy, arrayLibrary, sparkToken
  let accounts
  let nftPrice = parseEther('1.0')
  let nftEndPrice = parseEther('0.5')
  let offerPrice1 = parseEther('0.8')
  let offerPrice2 = parseEther('0.9')

  before(async () => {
    await upgrades.silenceWarnings();

    accounts = await ethers.getSigners()

    ArrayLibraryFactory = await ethers.getContractFactory('ArrayLibrary')
    arrayLibrary = await ArrayLibraryFactory.connect(accounts[0]).deploy()
    AddressesFactory = await ethers.getContractFactory('Addresses', { libraries: { ArrayLibrary: arrayLibrary.address } })
    ERC721SaleFactory = await ethers.getContractFactory('ERC721Sale', { libraries: { ArrayLibrary: arrayLibrary.address } })
    ERC721AuctionFactory = await ethers.getContractFactory('ERC721Auction', { libraries: { ArrayLibrary: arrayLibrary.address } })
    Custom721Factory = await ethers.getContractFactory('Custom721')
    Custom721RoyaltyFactory = await ethers.getContractFactory('Custom721Royal')
    ProxyFactory = await ethers.getContractFactory('ProxyRegistry')
    SparkTokenFactory = await ethers.getContractFactory('SparksToken')
  })

  beforeEach(async () => {
    addresses = await AddressesFactory.connect(accounts[0]).deploy()
    await addresses.deployed()
    erc721Sale = await upgrades.deployProxy(ERC721SaleFactory, [], { unsafeAllow: ['external-library-linking'] })
    await erc721Sale.deployed()
    erc721Auction = await upgrades.deployProxy(ERC721AuctionFactory, [], { unsafeAllow: ['external-library-linking'] })
    await erc721Auction.deployed()
    sparkToken = await SparkTokenFactory.connect(accounts[3]).deploy()
    await sparkToken.deployed()
    await (await erc721Sale.connect(accounts[0]).setSparkTokenContractAddr(sparkToken.address)).wait()
    await (await erc721Auction.connect(accounts[0]).setSparkTokenContractAddr(sparkToken.address)).wait()
    proxy = await ProxyFactory.deploy()
    await proxy.deployed()
    await (await proxy.connect(accounts[0]).setProxy(erc721Sale.address)).wait()
    await (await proxy.connect(accounts[0]).setProxy(erc721Auction.address)).wait()
    custom721 = await Custom721Factory.deploy('ERC721 NFT', 'ERC721 NFT', proxy.address)
    await custom721.deployed()
    await (await custom721.connect(accounts[0]).mint('path1', 3)).wait()
    custom721Royalty = await Custom721RoyaltyFactory.deploy('ERC721 Royalty NFT', 'ERC721 Royalty NFT', proxy.address)
    await custom721Royalty.deployed()
    await (await custom721Royalty.connect(accounts[0]).mint('path1', 3, accounts[4].address, 1000)).wait()
  })

  it('Check ERC721 NFT', async () => {
    expect(await custom721.totalMinted()).to.equal(3)
    expect(await custom721.tokenURI(1)).to.equal('path1')
    expect(await custom721.tokenURI(2)).to.equal('path1')
    expect(await custom721.tokenURI(3)).to.equal('path1')
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    expect(await custom721.tokenOfOwnerByIndex(accounts[0].address, 0)).to.equal(1)
    expect(await custom721.tokenOfOwnerByIndex(accounts[0].address, 1)).to.equal(2)
    expect(await custom721.tokenOfOwnerByIndex(accounts[0].address, 2)).to.equal(3)
  })

  it('Transfer NFT in ERC721 NFT Smart Contract', async () => {
    await (await custom721.connect(accounts[0]).transferFrom(accounts[0].address, accounts[1].address, 1)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721.balanceOf(accounts[1].address)).to.equal(1)
    expect(await custom721.tokenOfOwnerByIndex(accounts[0].address, 0)).to.equal(3)
    expect(await custom721.tokenOfOwnerByIndex(accounts[0].address, 1)).to.equal(2)
    expect(await custom721.tokenOfOwnerByIndex(accounts[1].address, 0)).to.equal(1)
  })

  it('Check Addresses Contract in Marketplace', async () => {
    expect(await erc721Sale.addressesContractAddr()).to.equal('0x0000000000000000000000000000000000000000')
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    expect(await erc721Sale.addressesContractAddr()).to.equal(addresses.address)
  })

  it('Check Adding, Verifying and Removing ERC721 NFT in Addresses', async () => {
    expect(await addresses.existingContract(custom721.address)).to.equal(false)
    await expect(addresses.isVerified(custom721.address)).to.be.revertedWith('Not Existing Contract')
    let normalContracts = await addresses.getNormalContracts()
    let verifiedContracts = await addresses.getVerifiedNormalContracts()
    expect(normalContracts.length).to.equal(0)
    expect(verifiedContracts.length).to.equal(0)
    await (await addresses.connect(accounts[0]).add(custom721.address)).wait()
    expect(await addresses.existingContract(custom721.address)).to.equal(true)
    normalContracts = await addresses.getNormalContracts()
    expect(normalContracts.length).to.equal(1)
    expect(normalContracts[0]).to.equal(custom721.address)
    verifiedContracts = await addresses.getVerifiedNormalContracts()
    expect(verifiedContracts.length).to.equal(0)
    await expect(addresses.add(custom721.address)).to.be.revertedWith('Exisitng Contract')
    await (await addresses.verify(custom721.address)).wait()
    expect(await addresses.isVerified(custom721.address)).to.equal(true)
    verifiedContracts = await addresses.getVerifiedNormalContracts()
    expect(verifiedContracts.length).to.equal(1)
    expect(verifiedContracts[0]).to.equal(custom721.address)
    await (await addresses.connect(accounts[0]).remove(custom721.address)).wait()
    normalContracts = await addresses.getNormalContracts()
    verifiedContracts = await addresses.getVerifiedNormalContracts()
    expect(normalContracts.length).to.equal(0)
    expect(verifiedContracts.length).to.equal(0)
  })

  it('Create Sale with Not Verified ERC721 NFT Smart Contract', async () => {
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await expect(erc721Sale.connect(accounts[0]).createSale(custom721.address, 1, 0, nftPrice, nftEndPrice, 1000)).to.be.revertedWith('Not Verified')
  })

  it('Create Sale and Cancel Sale with Verified ERC721 NFT Smart Contract', async () => {
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await (await addresses.verify(custom721.address)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Sale.connect(accounts[0]).createSale(custom721.address, 1, 0, nftPrice, nftEndPrice, 1000)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721.ownerOf(1)).to.equal(erc721Sale.address)
    const saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    const price = await erc721Sale.getCurrentPrice(custom721.address, 1)
    expect(price.lte(nftPrice)).to.equal(true)
    expect(price.gte(nftEndPrice)).to.equal(true)
    const currentPrice = await erc721Sale.getCurrentPrice(custom721.address, 1)
    expect(currentPrice.lte(nftPrice)).to.equal(true)
    expect(currentPrice.gte(nftEndPrice)).to.equal(true)
    await (await erc721Sale.connect(accounts[0]).cancelSale(custom721.address, 1)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    expect(await custom721.ownerOf(1)).to.equal(accounts[0].address)
  })

  it('Create Sale and Purchase with Verified ERC721 NFT Smart Contract', async () => {
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await (await addresses.verify(custom721.address)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Sale.connect(accounts[0]).createSale(custom721.address, 1, 0, nftPrice, nftEndPrice, 1000)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721.ownerOf(1)).to.equal(erc721Sale.address)
    const saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    const currentPrice = await erc721Sale.getCurrentPrice(custom721.address, 1)
    expect(currentPrice.lte(nftPrice)).to.equal(true)
    expect(currentPrice.gte(nftEndPrice)).to.equal(true)
    const prevBalance = await accounts[0].getBalance()
    const buyRes = await (await erc721Sale.connect(accounts[1]).buy(custom721.address, 1, {
      from: accounts[1].address,
      value: currentPrice
    })).wait()
    expect(await custom721.balanceOf(accounts[1].address)).to.equal(1)
    const saleSuccessEvent = buyRes.events.find(evnt => evnt.event === 'SaleSuccessful')
    const afterBalance = await accounts[0].getBalance()
    expect(afterBalance.sub(prevBalance).eq(saleSuccessEvent.args.price)).to.equal(true)
    expect(saleSuccessEvent.args.price.lt(nftPrice)).to.equal(true)
    expect(saleSuccessEvent.args.price.gt(nftEndPrice)).to.equal(true)
    expect(await custom721.tokenOfOwnerByIndex(accounts[1].address, 0)).to.equal(1)
    expect(await custom721.ownerOf(1)).to.equal(accounts[1].address)
  })

  it('Create Sale, Create Offer and Cancel Offer with Verified ERC721 NFT Smart Contract', async () => {
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await (await addresses.verify(custom721.address)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Sale.connect(accounts[0]).createSale(custom721.address, 1, 0, nftPrice, nftEndPrice, 1000)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721.ownerOf(1)).to.equal(erc721Sale.address)
    let saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    expect(saleInfo.sale.offerers.length).to.equal(0)
    let prevBalance = await accounts[1].getBalance()
    let txRes = await (await erc721Sale.connect(accounts[1]).makeOffer(custom721.address, 1, offerPrice1, { from: accounts[1].address, value: offerPrice1 })).wait()
    let afterBalance = await accounts[1].getBalance()
    expect(prevBalance.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(afterBalance.add(offerPrice1))
    prevBalance = await accounts[2].getBalance()
    txRes = await (await erc721Sale.connect(accounts[2]).makeOffer(custom721.address, 1, offerPrice2, { from: accounts[2].address, value: offerPrice2 })).wait()
    afterBalance = await accounts[2].getBalance()
    expect(prevBalance.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(afterBalance.add(offerPrice2))
    saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    expect(saleInfo.sale.offerers.length).to.equal(2)
    expect(saleInfo.sale.offerers[0]).to.equal(accounts[1].address)
    expect(saleInfo.sale.offerPrices[0]).to.equal(offerPrice1)
    expect(saleInfo.sale.offerers[1]).to.equal(accounts[2].address)
    expect(saleInfo.sale.offerPrices[1]).to.equal(offerPrice2)
    prevBalance = await accounts[1].getBalance()
    txRes = await (await erc721Sale.connect(accounts[1]).cancelOffer(custom721.address, 1)).wait()
    afterBalance = await accounts[1].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.add(offerPrice1))
    saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    expect(saleInfo.sale.offerers.length).to.equal(1)
    expect(saleInfo.sale.offerers[0]).to.equal(accounts[2].address)
    expect(saleInfo.sale.offerPrices[0]).to.equal(offerPrice2)
    await (await erc721Sale.connect(accounts[0]).cancelSale(custom721.address, 1)).wait()
    let claimable = await erc721Sale.claimable(accounts[2].address, 0)
    expect(claimable).to.equal(offerPrice2)
    prevBalance = await accounts[2].getBalance()
    txRes = await (await erc721Sale.connect(accounts[2]).claim(claimable, 0)).wait()
    afterBalance = await accounts[2].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.add(claimable))
  })

  it('Create Sale, Create Offer and Accept Offer with Verified ERC721 NFT Smart Contract', async () => {
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await (await addresses.verify(custom721.address)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Sale.connect(accounts[0]).createSale(custom721.address, 1, 0, nftPrice, nftEndPrice, 1000)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721.ownerOf(1)).to.equal(erc721Sale.address)
    let saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    expect(saleInfo.sale.offerers.length).to.equal(0)
    let prevBalance = await accounts[1].getBalance()
    let txRes = await (await erc721Sale.connect(accounts[1]).makeOffer(custom721.address, 1, offerPrice1, { from: accounts[1].address, value: offerPrice1 })).wait()
    let afterBalance = await accounts[1].getBalance()
    expect(prevBalance.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(afterBalance.add(offerPrice1))
    prevBalance = await accounts[2].getBalance()
    txRes = await (await erc721Sale.connect(accounts[2]).makeOffer(custom721.address, 1, offerPrice2, { from: accounts[2].address, value: offerPrice2 })).wait()
    afterBalance = await accounts[2].getBalance()
    expect(prevBalance.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(afterBalance.add(offerPrice2))
    saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    expect(saleInfo.sale.offerers.length).to.equal(2)
    expect(saleInfo.sale.offerers[0]).to.equal(accounts[1].address)
    expect(saleInfo.sale.offerPrices[0]).to.equal(offerPrice1)
    expect(saleInfo.sale.offerers[1]).to.equal(accounts[2].address)
    expect(saleInfo.sale.offerPrices[1]).to.equal(offerPrice2)
    prevBalance = await accounts[0].getBalance()
    txRes = await (await erc721Sale.connect(accounts[0]).acceptOffer(custom721.address, 1)).wait()
    afterBalance = await accounts[0].getBalance()
    expect(prevBalance.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(afterBalance.sub(offerPrice2))
    expect(await custom721.ownerOf(1)).to.equal(accounts[2].address)
    const claimable = await erc721Sale.claimable(accounts[1].address, 0)
    expect(claimable).to.equal(offerPrice1)
  })

  it('Create Sale, Create Offer and Cancel Sale by Spark Token with Verified ERC721 NFT Smart Contract', async () => {
    await (await sparkToken.connect(accounts[3]).setDistributionTeamsAddresses(accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address)).wait()
    await (await sparkToken.connect(accounts[3]).distributeTokens()).wait()
    await (await sparkToken.connect(accounts[3]).transfer(accounts[1].address, nftPrice)).wait()
    await (await sparkToken.connect(accounts[3]).transfer(accounts[2].address, nftPrice)).wait()
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await (await addresses.verify(custom721.address)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Sale.connect(accounts[0]).createSale(custom721.address, 1, 1, nftPrice, nftEndPrice, 1000)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721.ownerOf(1)).to.equal(erc721Sale.address)
    const saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    const currentPrice = await erc721Sale.getCurrentPrice(custom721.address, 1)
    expect(currentPrice.lte(nftPrice)).to.equal(true)
    expect(currentPrice.gte(nftEndPrice)).to.equal(true)
    await (await sparkToken.connect(accounts[1]).approve(erc721Sale.address, offerPrice1)).wait()
    await (await erc721Sale.connect(accounts[1]).makeOffer(custom721.address, 1, offerPrice1)).wait()
    await (await sparkToken.connect(accounts[2]).approve(erc721Sale.address, offerPrice2)).wait()
    await (await erc721Sale.connect(accounts[2]).makeOffer(custom721.address, 1, offerPrice2)).wait()
    await (await erc721Sale.connect(accounts[0]).cancelSale(custom721.address, 1)).wait()
    expect(await custom721.ownerOf(1)).to.equal(accounts[0].address)
    expect(await erc721Sale.claimable(accounts[1].address, 1)).to.equal(offerPrice1)
    expect(await erc721Sale.claimable(accounts[2].address, 1)).to.equal(offerPrice2)
    const buyerPrevBalance = await sparkToken.balanceOf(accounts[1].address)
    await erc721Sale.connect(accounts[1]).claim(offerPrice1, 1)
    const buyerAfterBalance = await sparkToken.balanceOf(accounts[1].address)
    expect(buyerAfterBalance.sub(buyerPrevBalance)).to.equal(offerPrice1)
  })

  it('Create Sale, Create Offer and Accept Offer by Spark Token with Verified ERC721 NFT Smart Contract', async () => {
    await (await sparkToken.connect(accounts[3]).setDistributionTeamsAddresses(accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address, accounts[3].address)).wait()
    await (await sparkToken.connect(accounts[3]).distributeTokens()).wait()
    await (await sparkToken.connect(accounts[3]).transfer(accounts[1].address, nftPrice)).wait()
    await (await sparkToken.connect(accounts[3]).transfer(accounts[2].address, nftPrice)).wait()
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await (await addresses.verify(custom721.address)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Sale.connect(accounts[0]).createSale(custom721.address, 1, 1, nftPrice, nftEndPrice, 1000)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721.ownerOf(1)).to.equal(erc721Sale.address)
    const saleInfo = await erc721Sale.getSale(custom721.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    const currentPrice = await erc721Sale.getCurrentPrice(custom721.address, 1)
    expect(currentPrice.lte(nftPrice)).to.equal(true)
    expect(currentPrice.gte(nftEndPrice)).to.equal(true)
    await (await sparkToken.connect(accounts[1]).approve(erc721Sale.address, offerPrice1)).wait()
    await (await erc721Sale.connect(accounts[1]).makeOffer(custom721.address, 1, offerPrice1)).wait()
    await (await sparkToken.connect(accounts[2]).approve(erc721Sale.address, offerPrice2)).wait()
    await (await erc721Sale.connect(accounts[2]).makeOffer(custom721.address, 1, offerPrice2)).wait()
    const sellerPrevBalance = await sparkToken.balanceOf(accounts[0].address)
    await (await erc721Sale.connect(accounts[0]).acceptOffer(custom721.address, 1)).wait()
    const sellerAfterBalance = await sparkToken.balanceOf(accounts[0].address)
    expect(sellerAfterBalance.sub(sellerPrevBalance)).to.equal(offerPrice2)
    expect(await custom721.ownerOf(1)).to.equal(accounts[2].address)
    expect(await erc721Sale.claimable(accounts[1].address, 1)).to.equal(offerPrice1)
  })

  it('Create Auction, Create Bid and Cancel Auction with Verified ERC721 NFT Smart Contract', async () => {
    await (await erc721Auction.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await (await addresses.verify(custom721.address)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Auction.connect(accounts[0]).createAuction(custom721.address, 1, 0)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    let prevBalance = await accounts[1].getBalance()
    let txRes = await (await erc721Auction.connect(accounts[1]).bid(custom721.address, 1, offerPrice1, { value: offerPrice1 })).wait()
    let afterBalance = await accounts[1].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.sub(offerPrice1))
    prevBalance = await accounts[2].getBalance()
    txRes = await (await erc721Auction.connect(accounts[2]).bid(custom721.address, 1, offerPrice2, { value: offerPrice2 })).wait()
    afterBalance = await accounts[2].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.sub(offerPrice2))
    prevBalance = await accounts[2].getBalance()
    txRes = await (await erc721Auction.connect(accounts[2]).cancelBid(custom721.address, 1)).wait()
    afterBalance = await accounts[2].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.add(offerPrice2))
    await (await erc721Auction.connect(accounts[0]).cancelAuction(custom721.address, 1)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    expect(await erc721Auction.claimable(accounts[1].address, 0)).to.equal(offerPrice1)
  })

  it('Create Auction, Create Bid and Accept Bid with Verified ERC721 NFT Smart Contract', async () => {
    await (await erc721Auction.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721.address)).wait()
    await (await addresses.verify(custom721.address)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Auction.connect(accounts[0]).createAuction(custom721.address, 1, 0)).wait()
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    let prevBalance = await accounts[1].getBalance()
    let txRes = await (await erc721Auction.connect(accounts[1]).bid(custom721.address, 1, offerPrice1, { value: offerPrice1 })).wait()
    let afterBalance = await accounts[1].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.sub(offerPrice1))
    prevBalance = await accounts[2].getBalance()
    txRes = await (await erc721Auction.connect(accounts[2]).bid(custom721.address, 1, offerPrice2, { value: offerPrice2 })).wait()
    afterBalance = await accounts[2].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.sub(offerPrice2))
    prevBalance = await accounts[0].getBalance()
    txRes = await (await erc721Auction.connect(accounts[0]).acceptBid(custom721.address, 1)).wait()
    afterBalance = await accounts[0].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.add(offerPrice2))
    expect(await custom721.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721.balanceOf(accounts[2].address)).to.equal(1)
    expect(await custom721.ownerOf(1)).to.equal(accounts[2].address)
    expect(await erc721Auction.claimable(accounts[1].address, 0)).to.equal(offerPrice1)
  })

  it('Create Sale and Purchase with Verified ERC721 Royalty NFT Smart Contract', async () => {
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721Royalty.address)).wait()
    await (await addresses.verify(custom721Royalty.address)).wait()
    expect(await custom721Royalty.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Sale.connect(accounts[0]).createSale(custom721Royalty.address, 1, 0, nftPrice, nftPrice, 1000)).wait()
    expect(await custom721Royalty.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721Royalty.ownerOf(1)).to.equal(erc721Sale.address)
    const saleInfo = await erc721Sale.getSale(custom721Royalty.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    const currentPrice = await erc721Sale.getCurrentPrice(custom721Royalty.address, 1)
    expect(currentPrice.lte(nftPrice)).to.equal(true)
    expect(currentPrice.gte(nftEndPrice)).to.equal(true)
    const prevBalance = await accounts[0].getBalance()
    const prevBalanceRoyalty = await accounts[4].getBalance()
    await (await erc721Sale.connect(accounts[1]).buy(custom721Royalty.address, 1, {
      from: accounts[1].address,
      value: currentPrice
    })).wait()
    expect(await custom721Royalty.balanceOf(accounts[1].address)).to.equal(1)
    const afterBalance = await accounts[0].getBalance()
    const afterBalanceRoyalty = await accounts[4].getBalance()
    expect(afterBalance.sub(prevBalance).eq(nftPrice.mul(9).div(10))).to.equal(true)
    expect(afterBalanceRoyalty.sub(prevBalanceRoyalty).eq(nftPrice.div(10))).to.equal(true)
    expect(await custom721Royalty.tokenOfOwnerByIndex(accounts[1].address, 0)).to.equal(1)
    expect(await custom721Royalty.ownerOf(1)).to.equal(accounts[1].address)
  })

  it('Create Sale, Create Offer and Accept Offer with Verified ERC721 Royalty NFT Smart Contract', async () => {
    await (await erc721Sale.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721Royalty.address)).wait()
    await (await addresses.verify(custom721Royalty.address)).wait()
    expect(await custom721Royalty.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Sale.connect(accounts[0]).createSale(custom721Royalty.address, 1, 0, nftPrice, nftPrice, 0)).wait()
    expect(await custom721Royalty.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721Royalty.ownerOf(1)).to.equal(erc721Sale.address)
    let saleInfo = await erc721Sale.getSale(custom721Royalty.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    expect(saleInfo.sale.offerers.length).to.equal(0)
    let prevBalance = await accounts[1].getBalance()
    let txRes = await (await erc721Sale.connect(accounts[1]).makeOffer(custom721Royalty.address, 1, offerPrice1, { from: accounts[1].address, value: offerPrice1 })).wait()
    let afterBalance = await accounts[1].getBalance()
    expect(prevBalance.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(afterBalance.add(offerPrice1))
    prevBalance = await accounts[2].getBalance()
    txRes = await (await erc721Sale.connect(accounts[2]).makeOffer(custom721Royalty.address, 1, offerPrice2, { from: accounts[2].address, value: offerPrice2 })).wait()
    afterBalance = await accounts[2].getBalance()
    expect(prevBalance.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(afterBalance.add(offerPrice2))
    saleInfo = await erc721Sale.getSale(custom721Royalty.address, 1)
    expect(saleInfo.sale.seller).to.equal(accounts[0].address)
    expect(saleInfo.sale.offerers.length).to.equal(2)
    expect(saleInfo.sale.offerers[0]).to.equal(accounts[1].address)
    expect(saleInfo.sale.offerPrices[0]).to.equal(offerPrice1)
    expect(saleInfo.sale.offerers[1]).to.equal(accounts[2].address)
    expect(saleInfo.sale.offerPrices[1]).to.equal(offerPrice2)
    prevBalance = await accounts[0].getBalance()
    const prevBalanceRoyalty = await accounts[4].getBalance()
    txRes = await (await erc721Sale.connect(accounts[0]).acceptOffer(custom721Royalty.address, 1)).wait()
    afterBalance = await accounts[0].getBalance()
    const afterBalanceRoyalty = await accounts[4].getBalance()
    expect(prevBalance.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(afterBalance.sub(offerPrice2.mul(9).div(10)))
    expect(afterBalanceRoyalty).to.equal(prevBalanceRoyalty.add(offerPrice2.div(10)))
    expect(await custom721Royalty.ownerOf(1)).to.equal(accounts[2].address)
  })

  it('Create Auction, Create Bid and Accept Bid with Verified ERC721 Royalty NFT Smart Contract', async () => {
    await (await erc721Auction.connect(accounts[0]).setAddressesContractAddr(addresses.address)).wait()
    await (await addresses.add(custom721Royalty.address)).wait()
    await (await addresses.verify(custom721Royalty.address)).wait()
    expect(await custom721Royalty.balanceOf(accounts[0].address)).to.equal(3)
    await (await erc721Auction.connect(accounts[0]).createAuction(custom721Royalty.address, 1, 0)).wait()
    expect(await custom721Royalty.balanceOf(accounts[0].address)).to.equal(2)
    let prevBalance = await accounts[1].getBalance()
    let txRes = await (await erc721Auction.connect(accounts[1]).bid(custom721Royalty.address, 1, offerPrice1, { value: offerPrice1 })).wait()
    let afterBalance = await accounts[1].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.sub(offerPrice1))
    prevBalance = await accounts[2].getBalance()
    txRes = await (await erc721Auction.connect(accounts[2]).bid(custom721Royalty.address, 1, offerPrice2, { value: offerPrice2 })).wait()
    afterBalance = await accounts[2].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.sub(offerPrice2))
    prevBalance = await accounts[0].getBalance()
    const prevBalanceRoyalty = await accounts[4].getBalance()
    txRes = await (await erc721Auction.connect(accounts[0]).acceptBid(custom721Royalty.address, 1)).wait()
    afterBalance = await accounts[0].getBalance()
    const afterBalanceRoyalty = await accounts[4].getBalance()
    expect(afterBalance.add(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice))).to.equal(prevBalance.add(offerPrice2.mul(9).div(10)))
    expect(afterBalanceRoyalty).to.equal(prevBalanceRoyalty.add(offerPrice2.div(10)))
    expect(await custom721Royalty.balanceOf(accounts[0].address)).to.equal(2)
    expect(await custom721Royalty.balanceOf(accounts[2].address)).to.equal(1)
    expect(await custom721Royalty.ownerOf(1)).to.equal(accounts[2].address)
    expect(await erc721Auction.claimable(accounts[1].address, 0)).to.equal(offerPrice1)
  })
})