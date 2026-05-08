import React from "react";
const getStatusStyle = (status) => {
    if (status === "delivered") {
        return "text-green bg-green-light-6";
    }
    if (status === "cancelled" || status === "on-hold" || status === "failed") {
        return "text-red bg-red-light-6";
    }
    return "text-yellow bg-yellow-light-4";
};
const OrderDetails = ({ orderItem }) => {
    return (<>
      <div className="items-center justify-between py-4.5 px-7.5 hidden md:flex ">
        <div className="min-w-[113px]">
          <p className="text-custom-sm text-dark">Order</p>
        </div>
        <div className="min-w-[113px]">
          <p className="text-custom-sm text-dark">Date</p>
        </div>

        <div className="min-w-[113px]">
          <p className="text-custom-sm text-dark">Status</p>
        </div>

        {/* <div className="min-w-[113px]">
          <p className="text-custom-sm text-dark">Title</p>
        </div> */}

        <div className="min-w-[113px]">
          <p className="text-custom-sm text-dark">Total</p>
        </div>

        {/* <div className="min-w-[113px]">
          <p className="text-custom-sm text-dark">Action</p>
        </div> */}
      </div>

      <div className="items-center justify-between border-t border-gray-3 py-5 px-7.5 hidden md:flex">
        <div className="min-w-[111px]">
          <p className="text-custom-sm text-red">
            #{orderItem.orderId.slice(-8)}
          </p>
        </div>
        <div className="min-w-[175px]">
          <p className="text-custom-sm text-dark">
            {orderItem.createdAt}
          </p>
        </div>

        <div className="min-w-[128px]">
          <p className={`inline-block text-custom-sm py-0.5 px-2.5 rounded-[30px] capitalize ${getStatusStyle(orderItem.status)}`}>
            {orderItem.status}
          </p>
        </div>

        {/* <div className="min-w-[213px]">
          <p className="text-custom-sm text-dark">{orderItem.orderTitle}</p>
        </div> */}

        <div className="min-w-[113px]">
          <p className="text-custom-sm text-dark">
            {orderItem.total}
          </p>
        </div>
      </div>
      <div className="px-7.5 w-full">
        <p className="font-bold">Shipping Address:</p>{" "}
        <p>942 Aspen Road Encino, CA 91316</p>
      </div>
    </>);
};
export default OrderDetails;
