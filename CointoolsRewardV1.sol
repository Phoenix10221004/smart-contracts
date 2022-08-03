// SPDX-License-Identifier: MIT

pragma solidity ^0.8.5;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CointoolsRewardV1 is Ownable {

    enum CourseType { Home, Charts, Pairs, Account, Promote }

    struct RewardType {
        CourseType course;
        address user;
        bool status;
    }

    ERC20 fast;
    uint256 rewardPerView;
    uint256 rewardPerRef;
    mapping(address => RewardType[]) rewards;
    mapping(address => mapping(address => bool)) promoted;
    mapping(address => mapping(CourseType => bool)) reviewed;

    constructor(address _fast, uint256 _rewardPerView, uint256 _rewardPerRef) {
        fast = ERC20(_fast);
        rewardPerView = _rewardPerView;
        rewardPerRef = _rewardPerRef;
    }

    function addReward(CourseType[] memory _course, address[] memory _owner, address[] memory _user) external onlyOwner {
        for(uint256 i = 0; i < _course.length; i ++) {
            if((_course[i] == CourseType.Promote && promoted[_owner[i]][_user[i]] == false) ||
                (_course[i] != CourseType.Promote && reviewed[_owner[i]][_course[i]] == false)) {
                rewards[_owner[i]].push(RewardType(_course[0], _user[i], true));
            }
        }
    }

    function getReward(address user) public view returns ( uint256 ) {
        uint256 total = 0;
        for(uint256 i = 0; i < rewards[user].length; i ++) {
            RewardType memory temp = rewards[user][i];
            if(temp.status == true && temp.course == CourseType.Promote) {
                total += rewardPerRef;
            } else if(temp.status == true && temp.course != CourseType.Promote) {
                total += rewardPerView;
            }
        }
        return total;
    }

    function withdrawReward() external {
        uint256 total = getReward(msg.sender);
        require(total > 0, "CointoolsRewardV1: No funds to withdraw");
        fast.transfer(msg.sender, total);
        for(uint256 i = 0; i < rewards[msg.sender].length; i ++) {
            rewards[msg.sender][i].status = true;
        }
    }

    function setRewardPerView(uint256 amount) external onlyOwner {
        rewardPerView = amount;
    }

    function setRewardPerRef(uint256 amount) external onlyOwner {
        rewardPerRef = amount;
    }

    function fund(uint256 amount) external onlyOwner {
        require(fast.balanceOf(msg.sender) >= amount, "CointoolsRewardV1: Insufficient fund");
        fast.transferFrom(msg.sender, address(this), amount);
    }

    function withdraw() external onlyOwner {
        uint256 balance = fast.balanceOf(address(this));
        require(balance > 0, "CointoolsRewardV1: Nothing to withdraw");
        fast.transfer(msg.sender, balance);
    }
}